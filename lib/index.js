// # create-loader.js
export default function createLoader(config) {
	return new Loader(config).hooks();
}

// # Loader
class Loader {

	// ## constructor(config)
	constructor(config) {
		this.stack = buildStack(config);
	}

	// ## handleStack(id, resource, ctx, defaultFunction)
	// Loops all functions in the given stack and returns the first one that 
	// returns something truthy.
	async handleStack(id, resource, ctx, defaultFunction) {

		// Our stack might still be building from the configuration objct, so 
		// make sure to await it.
		let stack = await this.stack;
		let fns = stack[id] || [];
		let options = { ...ctx };
		for (let fn of fns) {
			let result = await fn(resource, options);
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

}

// # buildStack(opts)
// This function will build an object containing the function stacks for each 
// loader hook based on the given configuration.
const keys = ['resolve', 'format', 'fetch', 'transform'];
async function buildStack(opts = {}) {

	// If no "hooks" field was found in the config, consider the config to be 
	// an individual loader configuration.
	let config = opts;
	if (!has(config, 'hooks')) {
		config = { hooks: config };
	}

	// Ensure that the hooks that were specified are an actual array.
	let hooks = arr(config.hooks).flat(Infinity);

	// Build up our stack now.
	let wait = [];
	let stack = createStack();
	for (let def of hooks) {

		// If the hook that was specified is a string, it's an es module that 
		// we'll have to import first. Note that we are going to do the 
		// loading *in parallel*.
		if (typeof def === 'string') {

			// Create a dummy stack so that we reserve space for the 
			// dynamically loaded loaders.
			let dummy = createStack();
			for (let key of keys) {
				let hook = stack[key];
				hook.push(dummy[key]);
			}

			// Now start loading.
			wait.push((async function() {
				let module = await import(def);
				fill(dummy, module.default);
			})());
			continue;

		} else {

			// The default way of specifying a loader is by using an object.
			fill(stack, def);

		}

	}

	// Await everything that's still being loaded. Once that is done we'll 
	// need to flatten everything in the stack again as the dynamically loaded 
	// configurations might be arrays as well.
	await Promise.all(wait);
	for (let key of keys) {
		stack[key] = stack[key].flat(Infinity);
	}
	return stack;

}

// # createStack()
// Helper function for creating an empty stack.
function createStack() {
	return keys.reduce((mem, key) => {
		mem[key] = [];
		return mem;
	}, {});
}

// # fill(stack, loader)
// Helper function for filling in a stack.
function fill(stack, loader) {

	// If the loader is a function, it's a transform function. Note: we 
	// probably need to refactor this a bit so that a loader can be specified 
	// using a regex as well.
	let def = loader;
	if (typeof def === 'function') {
		def = { transform: def };
	}

	// Add all parsed hooks to the stack.
	for (let key of keys) {
		let hook = stack[key];
		hook.push(...arr(def[key]));
	}

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
