## Redux
Redux的执行过程: UI层执行dispatch(action)，store接收到action，如果该dispatch对应的effect需要发异步请求，则会请求后拿到结果调用reduer，如果不用异步，则同步调用reduer，reduer执行后返回新的state，如果state对比之前发生改变，则则调用监听函数重新渲染 View （store.subscribe(render)）；自顶向下的数据流向，可以进行数据的时间旅行。

上述过程涉及几个概念(store、action、reduer、state)：
### action
```js
    // 1. 必须带有type属性
    // 2. 它的__proto__指向Object.prototype
    // 3. 使用payload属性表示附加数据（没有强制要求）
    // 4. 为了方便管理，一般会将对应的type放到单独的常量文件中方便管理
    // 5. 一般项目中会创建一个函数来创建action，该函数应为无副作用的纯函数
    const getSetUserAction = (user) =>  { type: SET_USER, payload: user }
    const SET_USER = "set_user"
    const action = getSetUserAction({userName: "Tom", password: "123"})
```

