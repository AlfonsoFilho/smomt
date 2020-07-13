
class SmartStore {
    constructor({ name, initialState, reducers, effects, selectors, options = {}, subscribe, deps = [] }) {


        this.setBuiltInSelectors(selectors)

        this.name = name

        if(options.hydrate) {
            initialState = this.hydrate()
        }

        this.worker = new Worker(this.createCode(initialState, reducers, selectors, effects, deps), { name })
        this.reducers = reducers
        this.effects = effects
        this.select = this.makeSelectors(selectors)
        this.options = options
        this.pending = {}
        this.deps = deps
        //this.cache

        this.worker.onmessage = (e) => {

            this.pending[e.data.id](e.data.projection)
        }

        this.subscribe(subscribe)
    }

    setBuiltInSelectors(selectors) {
        selectors.getState = (state) => state;
        return selectors
    }

    hydrate() {
        return atob(JSON.parse(localStorage.getItem('store:' + this.name)))
    }

    async persist() {
        const currentState = await this.select.getState()
        localStorage.setItem('store:' + this.name, btoa(JSON.stringify(currentState)))
    }

    async terminate({ persist = false }) {
        if(persist) {
            await this.persist()
        }
        this.worker.terminate()
    }

    subscribe(ids = []) {
        for(const id of ids) {
            globalThis.addEventListener(`dispatch:${id}`, e => {
                this.dispatch(e.detail)
            })
        }
    }

    static combineSelectors(...args) {

        const lastIndex = args.length - 1
        const selectors = args.slice(0, lastIndex).map(fn => fn.name)
        const fn = args[lastIndex].toString()

        return [...selectors, fn]
    }

    getId() {
        return Math.random().toString(32).slice(2, 10)
    }

    makeSelectors(selectors) {
        const select = {};
        for (const selector in selectors) {
            select[selector] = (...args) => new Promise((resolve, reject) => {
                const id = this.getId()
                this.worker.postMessage({ cmd: 'SELECT', selector, args, id })

                this.pending[id] = (data) => {
                    resolve(data)
                    delete this.pending[id]
                }
            })

        }

        return select
    }

    dispatch(msg) {
        if(this.options.broadcast) {
            globalThis.dispatchEvent(new CustomEvent(`dispatch:${this.name}`, {detail: {...msg, origin: this.name} }))
        }
        this.worker.postMessage({ cmd: 'DISPATCH', payload: msg })
    }

    convertSelectorToString(selectors) {
        let sel = ''

        for (let selector in selectors) {
            if (typeof selectors[selector] === 'function') {
                sel += `${selector}: ${selectors[selector].toString()},`
            }

            if (Array.isArray(selectors[selector])) {
                const current = selectors[selector]
                const lastIndex = current.length - 1
                const selectorNames = current.slice(0, lastIndex)
                const fn = current[lastIndex].toString()

                sel += `${selector}: (state) => {
                    const sel = ${JSON.stringify(selectorNames)}
                    const opts = sel.map((name) => selectors[name](state))
                    const fn = ${fn}
                    return fn.apply(null, opts)
                },`
            }
        }

        return `{ ${sel} }`;
    }

    convertReducersToString(reducers) {
        let str = ''

        for (const reducer of reducers) {
            str += reducer.toString() + ','
        }

        return `[${str}]`
    }

    convertEffectsToString() {
        return '[]'
    }

    createCode(initialState, reducers, selectors, effects, deps) {

        const selectorsObj = this.convertSelectorToString(selectors)
        const reducersObj = this.convertReducersToString(reducers)
        const effectsObj = this.convertReducersToString(effects)

       

        function workerCode() {
            //--
            let state = '##initialState##'

            const deps = '##deps##'
            const host = "'##host##'"
            
            deps.forEach(lib => importScripts(`${host}/${deps}`))

            function reducer(action, state, deps) {
                const reducers = '##reducersObj##'
    
                return reducers.reduce((updatedState, fn) => fn(action, updatedState, deps), state)
            }
    
            function effect(action, state, deps, select) {
                const effects = '##effectsObj##'
                
                const bindSelectors = Object.keys(select).reduce((acc, it) => {
                    acc[it] = select[it].bind(null, state)
                    return acc;
                }, {})
    
                for(const _effect of effects) {
                    _effect(action, state, deps, bindSelectors)
                }
    
                //console.log('effestcs', effects, select)
            }
    
            self.onmessage = (e) => {
                //console.log('log', e.data)
    
                const selectors = '##selectorsObj##'
    
                switch(e.data.cmd) {
                    case 'DISPATCH': {
                        state = reducer(e.data.payload, state)
                        effect(e.data.payload, state, {}, selectors)
                        // console.log('state?', state)
                        break;
                    }
                    case 'SELECT': {
                        
                        console.log('???', selectors, e.data.selector)
                        let projection = selectors[e.data.selector](state)
                        if(typeof projection === 'function') {
                            projection = projection.apply(null, e.data.args)
                        }
                        self.postMessage({projection, id: e.data.id})
                    
                        break;
                    }
                }
            }
            //---
        }

        const workerCodeStr = workerCode.toString()
            .replace('\'##initialState##\'', JSON.stringify(initialState))
            .replace('\'##reducersObj##\'', reducersObj)
            .replace('\'##effectsObj##\'', effectsObj)
            .replace('\'##selectorsObj##\'', selectorsObj)
            .replace('\'##deps##\'', JSON.stringify(deps))
            .replace('\'##host##\'', location.origin)

        // const blob = new Blob([workerCode], { type: 'application/javascript' })
        const blob = new Blob([workerCodeStr, 'workerCode()'], { type: 'application/javascript' })
        const code = URL.createObjectURL(blob)

        return code

    }
}




// ----------------------------------


function reducerA(action, state) {
    
    console.log('State', state, _.prop('total', state))
    
    switch (action.type) {
        case 'INC':
            return { total: state.total + 1 }

        case 'DEC':
            return { total: state.total - 1 }

        default:
            return { ...state }
    }
}


function reducerB(action, state) {
    // console.log('reducer B', action, state, deps)
    switch (action.type) {
        case 'INC':
            return { total: state.total + 1 }

        case 'DEC':
            return { total: state.total - 1 }

        default:
            return { ...state }
    }
}

async function effectA(action, state) {
    if (action.type === 'FETCH') {
        const r = await fetch('https://jsonplaceholder.typicode.com/todos/1')
            .then(response => response.json())

        // console.log('response', r)
    }
}

async function effectB(action, state, deps, select) {
    if (action.type === 'FETCH') {
        const r = await fetch('https://jsonplaceholder.typicode.com/todos/2')
            .then(response => response.json())

        // console.log('??', select)
        console.log('response (', r.title + ') : total = ' + select.getStringify())
    }
}

async function effectC(action, state, deps, select) {
    if (action.type === 'INC') {
        if(action.origin) {
            console.log('Effect C, INC', action)
        }
    }
}


// const _ = {
//     prop = (key, obj) => obj[key]
// }

const getTotal = (state) => state.total
const getDouble = (state) => state.total * 2
const getSuffix = (state) => (txt) => state.total + txt
const getStringify = SmartStore.combineSelectors(getTotal, getDouble, (total, double) => 'Result = ' + (total + double))

async function Program() {
    const store = new SmartStore({ name: 'Test', initialState: { total: 0 }, reducers: [reducerA, reducerB], effects: [effectA, effectB], selectors: { getTotal, getDouble, getSuffix, getStringify }, options: { broadcast: true }, deps: ['lodash.js'] })
    const store2 = new SmartStore({ name: 'Test2', initialState: { total: 0 }, reducers: [reducerA, reducerB], effects: [effectA, effectB, effectC], selectors: { getTotal, getDouble, getSuffix, getStringify },  subscribe: ['Test'], deps: ['lodash.js'] })

    console.log('store instance', store)

    console.log('R: total', await store.select.getTotal())
    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'INC' })
    store.dispatch({ type: 'INC' })

    console.log('R: total', await store.select.getTotal())

    store.dispatch({ type: 'DEC' })
    console.log('R: total', await store.select.getTotal())
    console.log('R: getDouble', await store.select.getDouble())
    // store.select.getDouble()
    // store.select.getSuffix(' === total')
    console.log('R: getSuffix', await store.select.getSuffix(' === total'))
    console.log('R: getStringify', await store.select.getStringify())
    // store.select.getSuffix(' === total')
    // store.select.getStringify()
    store.dispatch({ type: 'FETCH' })

    
    store2.dispatch({ type: 'INC' })
    store2.dispatch({ type: 'INC' })
    store2.dispatch({ type: 'INC' })
    console.log('R2: total', await store2.select.getTotal())

    // store.persist()
    store.terminate({persist: true})

    let newStore
    setTimeout(async () => {
        console.log('revial store')
        newStore = new SmartStore({ name: 'Test', initialState: { total: 0 }, reducers: [reducerA, reducerB], effects: [effectA, effectB], selectors: { getTotal, getDouble, getSuffix, getStringify }, options: { hydrate: true }, deps: ['lodash.js']  })
        newStore.dispatch({ type: 'INC' })
        newStore.dispatch({ type: 'INC' })
        console.log('newstore state', await newStore.select.getState())
    }, 10000)

}

Program()
