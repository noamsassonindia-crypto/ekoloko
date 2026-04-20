"use strict";
// JS implementation of com.vtweens.util.MainGetter

class MainGetter {
  static set MainCaller(v) {
    MainGetter._main = v;
  }
  static get MainCaller() {
    return MainGetter._main;
  }
  static get SFS() {
    return MainGetter._main?.SFS;
  }
  static set Helper(v) {
    MainGetter._helper = v;
  }
  static get Helper() {
    return MainGetter._helper;
  }
  static HelperCloseHitTest(x, y) {
    if (MainGetter._helper && typeof MainGetter._helper.hitTestHideButton === 'function') {
      return !!MainGetter._helper.hitTestHideButton(x, y);
    }
    return false;
  }
}

module.exports = MainGetter;
