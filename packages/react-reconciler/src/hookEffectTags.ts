// function App() {
//   useEffect(() => {
//       // create
//       return () => {
//           // destroy
//       }
//   }, [xxx, yyy])
//   useLayoutEffect(() => {})
//   useEffect(() => {}, [])
//   // ...
// }

// 注意区分本节课新增的3个flag：
// 对于fiber，新增PassiveEffect，代表「当前fiber本次更新存在副作用」
// 对于effect hook，Passive代表「useEffect对应effect」
// 对于effect hook，HookHasEffect代表「当前effect本次更新存在副作用」

// useEffect是commit后异步执行的
// useLayoutEffect、useInsertionEffect是commit后同步执行，但区别是执行useInsertionEffect的时候还拿不到dom的引用，主要是给cssInJs这样的库用的

// 区分不同的effect的tag
export const Passive = 0b0010; // useEffect
// export const Layout = 0b0010; // useLayoutEffect

// 区分是否需要触发create回调
export const HookHasEffect = 0b0001;

// 执行打印：
// 回调包括两类：
// create回调
// destroy回调

// 这意味着我们需要收集两类回调：在fiberRootNode下收集
// unmout时执行的destroy回调
// update时执行的create回调
// function App() {
//   const [num, updateNum] = useState(0);
//   useEffect(() => {
//     console.log('App mount');
//   }, []);

//   useEffect(() => {
//     console.log('num change create', num);
//     return () => {
//       console.log('num change destroy', num);
//     };
//   }, [num]);

//   return (
//     <div onClick={() => updateNum(num + 1)}>
//       {num === 0 ? <Child /> : 'noop'}
//     </div>
//   );
// }

// function Child() {
//   useEffect(() => {
//     console.log('Child mount');
//     return () => console.log('Child unmount');
//   }, []);

//   return 'i am child';
// }

// mount阶段：Child mount、App mount、'num change create', 0
// 点击后Child组件卸载：Child unmount、'num change destroy', 0、'num change create', 1

// 执行副作用
// 本次更新的任何create回调都必须在所有上一次更新的destroy回调执行完后再执行。

// 整体执行流程包括：
// 1.遍历effect
// 2.首先触发所有unmount effect，且对于某个fiber，如果触发了unmount destroy，本次更新不会再触发update create
// 3.触发所有上次更新的destroy
// 4.触发所有这次更新的create

// mount、update时的区别
// mount时：一定标记PassiveEffect
// update时：deps变化时标记PassiveEffect

// 如果useEffect要执行(依赖数组里面的依赖右变化)，会先执行上一次return的cleanup函数再执行本次的回调，并把回调返回的cleanup存下来下次用
