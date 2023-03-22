// # create-loader.js
import semver from 'semver';
import { isRule, generateRule } from './rule.js';
export default async function createLoader(...args) {
	const loader = await new Loader(...args).ready();
	return loader.hooks();
}

// # Loader
export const keys = ['resolve', 'format', 'fetch', 'transform'];
class Loader {

	// ## constructor(loaders, options)
	// The loader can be created in two ways: either by specifying a single 
	// object containing { loaders, options }, or by specifing a loaders and 
	// options object separately.
	constructor(loaders = {}, options = {}) {
		if (has(loaders, 'loaders')) {
			({ loaders, options = {} } = loaders);
		}
		this.options = options;
		this.stack = null;
		// eslint-disable-next-line no-async-promise-executor
		const loading = new Promise(async resolve => {
			this.stack = await this.buildStack(loaders);
			resolve(this);
		});
		this.ready = () => loading;
	}

	// ## handleStack(id, resource, ctx, defaultFunction)
	// Loops all functions in the given stack and returns the first one that 
	// returns something truthy.
	async handleStack(id, resource, ctx, defaultFunction) {

		// Our stack might still be building from the configuration objct, so 
		// make sure to await it.
		let fns = this.stack[id] || [];
		let baseOptions = { ...this.options };
		for (let { fn, options } of fns) {
			let finalOptions = {
				...baseOptions,
				...options,
				...ctx,
			};
			let result = await fn(resource, finalOptions);
			if (result) {
				return result;
			}
		}
		return defaultFunction(resource, ctx, defaultFunction);

	}

	// ## hooks()
	// This function returns an object containing all Node.js loader hooks as 
	// properties so that the loader entry file can re-export them. See #1. 
	// Given that the api changed in v16.12.0, we'll inspect the current 
	// process version and adapt accordingly.
	hooks() {

		// For backwards compatibility purposes, we will manually compose 
		// `format()`, `fetch()` and `transform()` into a `load()` function.
		const hook = id => (...args) => this.handleStack(id, ...args);
		const resolve = shortCircuit(hook('resolve'));
		const getFormat = hook('format');
		const getSource = hook('fetch');

		// Handling transformation is fundamentally different as we have to 
		// chain results here.
		const transformSource = async (source, ctx, node) => {
			let fns = this.stack.transform || [];
			let baseOptions = { ...this.options };
			let mem = source;
			let flag = true;
			for (let { fn, options } of fns) {
				let finalOptions = {
					...baseOptions,
					...options,
					...ctx,
				};
				let result = await fn(mem, finalOptions);
				if (result || typeof result === 'string') {
					flag = false;
					if (typeof result === 'string') {
						mem = result;
					} else {
						mem = result.source;
					}
				}
			}
			if (flag) {
				return node(source, ctx, node);
			} else {
				return { source: mem };
			}
		};

		// Now compose the correct hooks based on the Node version we're 
		// running.
		if (semver.satisfies(process.version, '<16.12.0')) {
			return {
				resolve,
				getFormat,
				getSource,
				transformSource,
			};
		}

		// If we reach this point, it means we're running on Node v16.12.0 or 
		// higher, which uses the new approach. We only have to export a 
		// `resolve` and `load` function here, but the difficulty is that the 
		// `load()` function has to be composed manually!
		const load = shortCircuit(async function(url, ctx, defaultLoad) {

			// If the format was already specified by the resolve hook, we 
			// won't try to fetch it again. Note that this functionality is 
			// specific to v16.12.
			const grab = (obj = {}) => obj.format;
			let {
				format = await getFormat(url, ctx, noop).then(grab),
			} = ctx;

			// Mock the default `getSource` function. What's important here is 
			// that if we the default getSource is used, we'll also set it as 
			// default format!
			const defaultGetSource = async (url, ctx) => {
				let result = await defaultLoad(url, { format });
				if (!format) {
					format = result.format;
				}
				return result;
			};
			let { source } = await getSource(url, ctx, defaultGetSource);

			// At last transform.
			const defaultTransform = source => ({ source });
			let transform = await transformSource(
				source,
				{ url, format },
				defaultTransform,
			);
			return {
				format,
				source: transform.source,
			};

		});
		return { resolve, load };

	}

	// ## buildStack(config)
	// The function that will build an object containing the function stacks 
	// for each loader hook based on the given hooks configuration.
	async buildStack(config) {

		// Ensure that the hooks that were specified are an actual flat array.
		let hooks = arr(config).flat(Infinity);

		// Build up our stack now.
		let wait = [];
		let stack = createStack();
		for (let obj of hooks) {

			// Make sure to get a normalized definition.
			let def = normalize(obj);

			// If the hook that was specified is a string, it's an es module 
			// that we'll have to import first. Note that we are going to do 
			// the loading *in parallel*.
			if (typeof def.loader === 'string') {

				// Create a dummy stack so that we reserve space for the 
				// dynamically loaded loaders.
				let dummy = createStack();
				for (let key of keys) {
					let hook = stack[key];
					hook.push(dummy[key]);
				}

				// Now start loading.
				wait.push((async () => {
					let module = await import(def.loader);
					let normalized = normalize({
						hooks: module.default,
						options: def.options,
					});
					this.fill(normalized, dummy);
				})());
				continue;

			} else {

				// The default way of specifying a loader is by using an 
				// object.
				this.fill(def, stack);

			}

		}

		// Await everything that's still being loaded. Once that is done we'll 
		// need to flatten everything in the stack again as the dynamically 
		// loaded configurations might be arrays as well.
		await Promise.all(wait);
		for (let key of keys) {
			stack[key] = stack[key].flat(Infinity);
		}
		return stack;

	}

	// ## fill(loader, stack)
	// Fills in the loader hooks in our stack.
	fill(loader, stack) {
		let { hooks, options } = loader;
		for (let key of keys) {
			let hook = stack[key];
			let fns = arr(hooks[key]);
			for (let fn of fns) {
				hook.push({
					fn,
					options,
				});
			}
		}
	}

}

// See #4. In Node 18.6 we now need to specify explicitly that we're 
// short-circuiting, which is what this function does.
function shortCircuit(fn) {
	return async function(...args) {
		return {
			shortCircuit: true,
			...await fn(...args),
		};
	};
}

// # normalize(def)
// Properly normalizes a loader definition.
function normalize(def) {
	if (typeof def === 'string') {
		return {
			loader: def,
			options: {},
		};
	}

	// Check if the loader is a webpack-like rule. If that's the case, generate 
	// the hooks for it manually.
	let loader = def;
	if (isRule(loader)) {
		loader = generateRule(loader);
	}

	// Now continue the normalization process so that the `generateRule` can 
	// use shortcuts too.
	if (has(loader, 'loader')) {
		return {
			loader: loader.loader,
			options: { ...loader.options },
		};
	} else if (!has(loader, 'hooks')) {
		return {
			hooks: loader,
			options: {},
		};
	} else {
		return loader;
	}
}

// # createStack()
// Helper function for creating an empty stack.
function createStack() {
	return keys.reduce((mem, key) => {
		mem[key] = [];
		return mem;
	}, {});
}

// # arr(obj)
// Helper function for ensuring an object is a *flat* array.
function arr(obj) {
	if (!obj) {
		return [];
	} else if (!Array.isArray(obj)) {
		return [obj];
	} else {
		return obj.flat(Infinity);
	}
}

// # has(obj, prop)
function has(obj, prop) {
	return Object.prototype.hasOwnProperty.call(obj, prop);
}

// # noop()
function noop() {}
