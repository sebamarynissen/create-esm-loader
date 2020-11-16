// # create-loader.js
export default function createLoader(...args) {
	return new Loader(...args).hooks();
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
		this.stack = this.buildStack(loaders);
	}

	// ## handleStack(id, resource, ctx, defaultFunction)
	// Loops all functions in the given stack and returns the first one that 
	// returns something truthy.
	async handleStack(id, resource, ctx, defaultFunction) {

		// Our stack might still be building from the configuration objct, so 
		// make sure to await it.
		let stack = await this.stack;
		let fns = stack[id] || [];
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
	// properties so that the loader entry file can re-export them. It's here 
	// that we can do some checks of the Node version in the future if we want.
	hooks() {
		const hook = id => (...args) => this.handleStack(id, ...args);
		return {
			resolve: hook('resolve'),
			getFormat: hook('format'),
			getSource: hook('fetch'),
			transformSource: hook('transform'),
		};
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
		for (let def of hooks) {

			// If the hook that was specified is a string, it's an es module 
			// that we'll have to import first. Note that we are going to do 
			// the loading *in parallel*.
			if (typeof def === 'string') {

				// Create a dummy stack so that we reserve space for the 
				// dynamically loaded loaders.
				let dummy = createStack();
				for (let key of keys) {
					let hook = stack[key];
					hook.push(dummy[key]);
				}

				// Now start loading.
				wait.push((async () => {
					let module = await import(def);
					this.fill(module.default, dummy);
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
		let { hooks, options } = normalize(loader);
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

// # normalize(loader)
// Properly normalizes a loader definition.
function normalize(loader) {
	if (!has(loader, 'hooks')) {
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
