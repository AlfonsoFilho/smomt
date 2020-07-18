// debugger
const _ = {
  prop: (key, obj) => obj[key],
};

// (function (root, factory) {
//   if (typeof exports === 'object') {
//     // CommonJS
//     module.exports = factory(require('b'));
//   } else if (typeof define === 'function' && define.amd) {
//     // AMD
//     define(['b'], function (b) {
//       return (root.returnExportsGlobal = factory(b));
//     });
//   } else {
//     // Global Variables
//     root.returnExportsGlobal = factory(root.b);
//   }
// }(this, function (b) {
//   // Your actual module
//   return {};
// }));
