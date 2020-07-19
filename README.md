# SMOMT

> State Management Off-Main-Thread

---

## Features

- [ ] Flux Standard Action
- [ ] Run in a worker
- [ ] postMessage pass action and selector result
- [ ] Support for vanilla, react and preact
- [ ] implement selector
- [ ] implement selector cache
- [ ] implement effects
- [ ] single or multiple stores
- [ ] combine reducers
- [ ] combine effects
- [ ] combine selectors
- [ ] communication between stores
- [ ] channel communication
- [ ] lazy-load/increment store
- [ ] inject library
- [ ] hydrate state
- [ ] redux dev tool
- [ ] json of state
- [ ] dirty check
- [ ] history - state snapshot

```js
const login = createDispatcher("Login", (username, password) => {
  username, password;
});
const loginSuccess = createDispatcher("LoginSuccess");

createEffect(login, async (action, state) => {
  const resp = await fetch("api.example.com", { ...action.payload });
  loginSuccess();
});

createReducer(
  on(login, (state) => ({ ...state })),
  on(login, (state) => ({ ...state }))
);

const selectList = createSelector(selectA, selectB, (a, b) => a + b);

const list = await selectList();

const {
  createDispatcher,
  createEffect,
  createReducer,
  createSelector,
} = new Store({
  // singleton
  name,
  initialState,
  broadcast,
  log,
  hydrate,
  deps,
  test,
});
```
