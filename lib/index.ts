export class StoreFactory {
  public name: string;
  private worker: Worker;
  private reducers: Function[];
  private effects: Function[];
  public select: Record<string, Function>;
  private pending = {};
  private deps: any[];
  private broadcast: boolean;
  private reduxDevTools: any;
  private stateTrack: any;
  private devTool: any;

  constructor({
    name,
    initialState,
    reducers,
    effects,
    selectors,
    subscribe,
    hydrate,
    deps = [],
    broadcast = false,
  }) {
    this._setBuiltInSelectors(selectors);

    this.name = name;

    if (hydrate) {
      initialState = this._hydrate();
    }

    this.worker = new Worker(
      this._createCode(initialState, reducers, selectors, effects, deps),
      { name }
    );
    this.reducers = reducers;
    this.effects = effects;
    this.select = this._makeSelectors(selectors);

    this.deps = deps;
    this.broadcast = broadcast;
    //this.cache

    this.worker.onmessage = (e) => {
      this.pending[e.data.id](e.data.projection);
    };

    this.subscribe(subscribe);

    this._setupReduxDevTool(initialState);
  }

  private _setupReduxDevTool(initialState) {
    this.reduxDevTools = (window as any).__REDUX_DEVTOOLS_EXTENSION__;
    this.stateTrack = initialState;

    if (this.reduxDevTools) {
      console.log(this.reduxDevTools);
      this.devTool = this.reduxDevTools.connect({
        name: this.name,
      });
      this.devTool.init(this.stateTrack);
    }

    const unsubscribe = this.devTool.subscribe((message) => {
      if (message.type === "DISPATCH" && message.payload) {
        switch (message.payload.type) {
          case "JUMP_TO_STATE":
          case "JUMP_TO_ACTION":
            this.dispatch({
              type: "__set_state__",
              payload: JSON.parse(message.state),
            });
            break;
          case "COMMIT":
            this.devTool.init(this.stateTrack);
            break;
          case "ROLLBACK":
          case "RESET":
            this.devTool.init(this.stateTrack);
            this.dispatch({
              type: "__set_state__",
              payload: JSON.parse(message.state),
            });
            break;
        }
      }
    });
  }

  private _logAction(action, printLog = false) {
    if (printLog) {
      console.log(this.name + " > ", action);
    }

    if (Boolean(this.devTool)) {
      this.stateTrack = this.reducers.reduce((updatedState, fn) => {
        const fnStr = fn.toString();
        const fnBody = fnStr.substring(
          fnStr.indexOf("{") + 1,
          fnStr.lastIndexOf("}")
        );
        return new Function("action", "state", "_", fnBody)(
          action,
          updatedState,
          {
            prop: () => {
              console.log("fake props");
              return "pronto";
            },
          }
        );
        //   return fn(action, updatedState)
      }, this.stateTrack);
      console.log("satate tack updated", this.stateTrack);
      this.devTool.send(action, this.stateTrack);
    }
  }

  private _setBuiltInSelectors(selectors) {
    selectors.getState = (state) => state;
    return selectors;
  }

  private _hydrate() {
    return JSON.parse(atob(localStorage.getItem("store:" + this.name)));
  }

  public async persist() {
    const currentState = await this.select.getState();
    localStorage.setItem(
      "store:" + this.name,
      btoa(JSON.stringify(currentState))
    );
  }

  public async terminate({ persist = false }) {
    if (persist) {
      await this.persist();
    }
    this.worker.terminate();
  }

  public subscribe(ids = []) {
    for (const id of ids) {
      globalThis.addEventListener(`dispatch:${id}`, (e: Event) => {
        this.dispatch((e as CustomEvent).detail);
      });
    }
  }

  public static combineSelectors(...args) {
    const lastIndex = args.length - 1;
    const selectors = args.slice(0, lastIndex).map((fn) => fn.name);
    const fn = args[lastIndex].toString();

    return [...selectors, fn];
  }

  private _getId() {
    return Math.random().toString(32).slice(2, 10);
  }

  private _makeSelectors(selectors) {
    const select = {};
    for (const selector in selectors) {
      select[selector] = (...args) =>
        new Promise((resolve, reject) => {
          const id = this._getId();
          this.worker.postMessage({ cmd: "SELECT", selector, args, id });

          this.pending[id] = (data) => {
            resolve(data);
            delete this.pending[id];
          };
        });
    }

    return select;
  }

  dispatch(msg) {
    if (this.broadcast) {
      globalThis.dispatchEvent(
        new CustomEvent(`dispatch:${this.name}`, {
          detail: { ...msg, origin: this.name },
        })
      );
    }
    if (this.devTool) {
      this._logAction(msg);
    }
    this.worker.postMessage({ cmd: "DISPATCH", payload: msg });
  }

  private _convertSelectorToString(selectors) {
    let sel = "";

    for (let selector in selectors) {
      if (typeof selectors[selector] === "function") {
        sel += `${selector}: ${selectors[selector].toString()},`;
      }

      if (Array.isArray(selectors[selector])) {
        const current = selectors[selector];
        const lastIndex = current.length - 1;
        const selectorNames = current.slice(0, lastIndex);
        const fn = current[lastIndex].toString();

        sel += `${selector}: (state) => {
                        const sel = ${JSON.stringify(selectorNames)}
                        const opts = sel.map((name) => selectors[name](state))
                        const fn = ${fn}
                        return fn.apply(null, opts)
                    },`;
      }
    }

    return `{ ${sel} }`;
  }

  private _convertReducersToString(reducers) {
    let str = "";

    for (const reducer of reducers) {
      str += reducer.toString() + ",";
    }

    return `[${str}]`;
  }

  private _createCode(initialState, reducers, selectors, effects, deps) {
    const selectorsObj = this._convertSelectorToString(selectors);
    const reducersObj = this._convertReducersToString(reducers);
    const effectsObj = this._convertReducersToString(effects);

    function workerCode() {
      //--
      let state = "##initialState##";

      const deps = "##deps##";
      const host = "'##host##'";

      ((deps as unknown) as any[]).forEach((lib) =>
        importScripts(`${host}/${deps}`)
      );

      function reducer(action, state) {
        const reducers = ("##reducersObj##" as unknown) as Function[];

        return ((reducers as unknown) as any[]).reduce(
          (updatedState, fn) => fn(action, updatedState, deps),
          state
        );
      }

      function effect(action, state, select) {
        const effects = ("##effectsObj##" as unknown) as Function[];

        const bindSelectors = Object.keys(select).reduce((acc, it) => {
          acc[it] = select[it].bind(null, state);
          return acc;
        }, {});

        for (const _effect of effects) {
          _effect(action, state, bindSelectors);
        }

        //console.log('effestcs', effects, select)
      }

      ((self as unknown) as Worker).onmessage = (e) => {
        //console.log('log', e.data)

        const selectors = ("##selectorsObj##" as unknown) as Record<
          string,
          Function
        >;

        switch (e.data.cmd) {
          case "DISPATCH": {
            state = reducer(e.data.payload, state);
            effect(e.data.payload, state, selectors);
            // console.log('state?', state)
            break;
          }
          case "SELECT": {
            console.log("???", selectors, e.data.selector);
            let projection = selectors[e.data.selector](state);
            if (typeof projection === "function") {
              projection = projection.apply(null, e.data.args);
            }
            ((self as unknown) as Worker).postMessage({
              projection,
              id: e.data.id,
            });

            break;
          }
        }
      };
      //---
    }

    const workerCodeStr = workerCode
      .toString()
      .replace("'##initialState##'", JSON.stringify(initialState))
      .replace("'##reducersObj##'", reducersObj)
      .replace("'##effectsObj##'", effectsObj)
      .replace("'##selectorsObj##'", selectorsObj)
      .replace("'##deps##'", JSON.stringify(deps))
      .replace("'##host##'", location.origin);

    // const blob = new Blob([workerCode], { type: 'application/javascript' })
    const blob = new Blob([workerCodeStr, "workerCode()"], {
      type: "application/javascript",
    });
    const code = URL.createObjectURL(blob);

    return code;
  }
}
