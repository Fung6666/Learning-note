/**
 * ref to: https://webpack.js.org/concepts/module-federation/
 * @param {*} props 
 * @returns 
 */
// this component is webpack5 remote component loader
const System = (props) => {
    const {
      remote,
      url,
      module,
      token,
      loadingComponent = "Loading...",
      remoteEntry = `remoteEntry.js?${Date.now()}`,
      predicate = "",
      environmentVariables,
      isPilot = false
    } = props;

    if (!remote || !url || !module) {
      throw new Error("Empty remote | url | module, please check!");
    }

    // need lazy load webpack5 remote entry
    // React.lazy(() => Promise<ReactNode>)
    const Component = React.lazy(loadComponent(
      remote,
      "default",
      module,
      url,
      token,
      remoteEntry,
      predicate,
      environmentVariables,
      isPilot
    ))

    return (
      <Suspense fallback={loadingComponent}>
        <Component/>
      </Suspense>
    );
}

const loadComponent = (props) => {
  const {
    remote,   // assettransfer
    shareScope, // default
    module,    // ./App
    url,      // https://xxxxxx/waij/assettransfer ---> 获取前端构建产物的网关url，根据具体项目而定
    token,    
    remoteEntry,  // `remoteEntry.js?${Date.now()}`
    predicate,    // waij-ui  ---> 获取前端构建产物请求网关时拼接的前缀表示， 根据具体项目而定
    environmentVariables, // 环境变量
    isPilot
  } = props

  return async () => {
    if (!window[remote]) {
      // 如果window中没有remote信息，则开始加载remote资源
      environmentVariables && await loadEnvironmentVariables(environmentVariables);

      console.debug(remote, "Fetching asset manifest");

      // baseUrl = `https://xxxxxxx/${predicate}/ui-assettransfer-mfe`
      const baseUrl  = await getBasePathAssetManifest(url, token, predicate, isPilot)

      console.debug(remote, "Loading remote")

      await getOrLoadRemote(remote, shareScope, `${baseUrl}/${remoteEntry}`.replace(/([^:]\/+)/g), $1)
    }

    // 经过上述对应remote资源的加载，资源模块已经是挂载在window上
    const container = window[remote];
    const factory = await container?.get(module);
    const Module = factory();
    return Module
  }
}

const loadEnvironmentVariables = (envObj) => {
  console.debug("setting environment variables to window", envObj);
  window.__mfe__ = {
    ...window.__mfe__,
    ...envObj
  }
  console.debug("completed setting environments to window", window.__mfe__)
}

const getBasePathAssetManifest = async (props) => {
  const {
    url,
    token,
    predicate,
    isPilot
  } = props;

  const urlPath = new URL(url);
  const pathSegments = urlPath.pathname.split("/").filter(item => item !== "");
  
  let derivedPath = "";
  if (pathSegments.length > 1 && predicate.length <= 0) {
    pathSegments.pop();
    const newPathName = `/${pathSegments.join("/")}`;
    urlPath.pathname = newPathName;
    derivedPath = urlPath.href;
  } else {
    derivedPath = urlPath.origin // https://xxxxxxxxxx
  }

  // asset-manifest.json 是 webpack打包后静态资源的路径映射文件
  // 只要是使用了cra创建的react项目 build了以后 都会自动生成
  return await fetch(
    token 
      ? `${url}/asset-manifest.json`.replace(/([^:]\/+)/g, "$1")
      : `${url}/remoteEntry.js`.replace(/([^:]\/+)/g, "$1"),
      {
        method: "GET",
        headers: {
          ...Boolean(token)
            ? {
              Authorization: `Bearer ${token}`
            }
            : {
              isPilot: String(isPilot)
            }
        }
      }
  ).then((resp) => {
    // 能请求成功，说明资源已经成功部署, 回返回对应的请求头标识
    const contentRoute = resp.headers.get("x-gateway-content-route");
    if (contentRoute) {
      // https://xxxxxxx/waij-ui/ui-assettransfer-mfe
      return `${derivedPath}${predicate}${contentRoute}`
    } else {
      const contentServer = resp.headers.get("x-web-content-server");
      return {
        contentServer: contentServer ? contentServer : url
      }
    }
  })
}

/**
 * @param {string} remote - the remote global name
 * @param {object | string} shareScope - the shareScope Object OR scope key
 * @param {string} remoteFallbackUrl - fallback url for remote module
 * @returns {Promise<object>} - Federated Module Container
 */
const getOrLoadRemote = (props) => {
  const {
    remote,  // assettransfer
    shareScope,  // default
    remoteFallbackUrl  // https://xxxxxx/waij-ui/ui-assettransfer-mfe/remoteEntry.js
  } = props

  return new Promise((resolve, reject) => {
    // check if remote exists on window
    if (!window[remote]) {
      // search dom to see if remote tag exists, but might still be loading (async)
      const existingRemote = document.querySelector(`[data-webpack="${remote}"]`);

      const onload = (originOnload) = async () => {
        // check if it was initialized
        if (!window[remote].__initialized) {
          // if share scope doesnt exist (like webpack 4) then expect shareScope to be a manual object
          // __webpack_share_scopes__ will be injected in global scope during runtime for loading remote.
          // __webpack_share_scopes__ === __webpack_require__.S
          if (typeof __webpack_share_scopes__ === "undefined") {
            // use default share scope object passed in manually
            await window[remote].init(shareScope.default);
          } else {
            // otherwise, init share scope as usual
            await window[remote].init(__webpack_share_scopes__[shareScope]);
          }
          // mark remote as initialized
          window[remote].__initialized = true;
        }
        // resolve promise so marking remote as loaded
        resolve();
        originOnload && originOnload();
      }

      if (existingRemote) {
        // remote stil loading
        // if existing remote but not loaded, hook into its onload and wait for it to be ready
        existingRemote.onload = onload(existingRemote.onload)
        existingRemote.onerror = reject;
      } else if (remoteFallbackUrl) {
        // without remote loading
        // need inject remote if a fallback exists and call the same onload function
        const script = document.createElement("script");
        script.type = "text/javascript";
        // marks as data-webpack so runtime can track it internally
        script.setAttribute("data-webpack", `${remote}`);
        script.async = true;
        script.onerror = reject;
        script.onload = onload(null);
        script.src = remoteFallbackUrl;
        document.getElementsByTagName("head")[0].appendChild(script);
       } else {
        // no remote and no fallback exist, reject
        reject(`Cannot Find Remote ${remote} to inject`);
       }
    } else {
      // remote already instanstiated, resolve
      resolve();
    }
  })
}

// after remoteEntry.js loaded
// 1. remote will hook in window
window["assettransfer"] = {
  get: function(moduleName) {
    const moduleMapper = {
      "./App": () => Promise.all([
        import("scr_Providers_tsx"),
        import("src_utils_token_index.ts"),
        import("src_Routes_tsx"),
        //.... 动态加载 入口位置的资源模块
      ])
    }
    return moduleMapper[moduleName];
  },
  init: function (shareScope) {
    // 加载一些共享模块
    // 其实是从__webpack_require__.S中获取获取share模块，并动态加载
    /**
     *  __webpack_require__.S = {
            [scopeName: 默认为default]: {
                "react-dom" : {
                    17.0.2 : {
                        get: factory(加载函数)
                    }
                },
                "react" : {
                    17.0.2 : {
                        get: factory(加载函数)
                    }
              }
        }
      * 
      */
    if (!__webpack_require__.S) return;
    const name = "default";
    const oldScope = __webpack_require__.S[name];
    if (oldScope && oldScope !== shareScope) throw new Error("shareScope has already changed");
    __webpack_require__.S[name] = shareScope;
    return Promise.all([import(shareModules["react-dom"]["17.0.2"].get()), import(shareModules["react"]["17.0.2"].get())]);
  },
  __initialized: true,
}


// 0. 在ui-productservice中，并没有使用remotes的方式，将ui-asset-transfer作为远程动态资源加载到项目中，而是
// 封装了上述的CCMFELoader组件，通过动态加载远程资源的方式，实现了ui-asset-transfer的动态加载

// 1. 在ui-asset-transfer中，入口的index.tsx中使用了import("bootstript.tsx")这种写法，但是在生产中，bootstript.tsx
// 文件并不会作为远程资料直接加载，import("bootstript.tsx")只有应用作为host的时候才会生效
// host 的构建产物如下: 
const a = {
  "./src/index.js": (
  __unused_webpack_module,
  __unused_webpack_exports,
  __webpack_require__
  ) => {
    Promise.all([
      __webpack_require__.e("vendors-node_modules_react-dom_index_js"),
      __webpack_require__.e("src_bootstrap_js"),
    ]).then(
      __webpack_require__.bind(__webpack_require__, "./src/bootstrap.js")
    );
  }
}

// 2. host应用要动态import("bootstript.tsx")，是因为要先加载远程资源remoteEntry.js
// 获取到remote信息，随后通过__webpack_require.e初始化remote资源，之后再加载本地代码，
// 从而可以在本地加载remote模块

// 3. remoteEntry.js 加载后, 需要调用module.init来加载共享模块，随后在加载本地代码