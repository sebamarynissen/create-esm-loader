# create-esm-loader

> A utility library for creating esm loader hooks

**DISCLAIMER** Loaders [are still experimental](https://nodejs.org/api/esm.html#esm_experimental_loaders) in Node and may still change, which means this module is still experimental as well.
Use at own risk and **DO NOT** rely on it in production.

Node 14 provides full support for native ES Modules without the need for transpilation.
While CommonJS is likely not to go anywhere soon, it is good practice to [at least start thinking about migrating your codebase from CommonJS to ESM](https://blog.sindresorhus.com/get-ready-for-esm-aa53530b3f77).
In the `require`-world, we had [require.extensions](https://nodejs.org/api/modules.html#modules_require_extensions) if we wanted to load non-JS files into Node.
You could use this, for example, to load TypeScript files and compile them just-in-time.
While this was not a good idea in production, it was a nice to have in development.
For example, you could run tests without having to transpile them first.

In the ESM world we no longer have `require.extensions`, but Node provides us with [loader hooks](https://nodejs.org/api/esm.html#esm_experimental_loaders) which can be used to provide the same functionality, and even more.
The goal of this module is to make it easier to write such loaders, especially when composing loaders.
It is **strongly disadvised** to use this module in production.
The aim is not to eliminate the necessity of a build step, but to make your life easier **during development**.

## Installation

```npm install create-esm-loader```

but you guessed that, right?

## Usage

`create-esm-loader` is inspired by Webpack.
You can pass it a configuration object and it will return a set of [loader hooks](https://nodejs.org/api/esm.html#hooks) which you then have to export manually.
This typically looks like
```js
// loader.js
import createLoader from 'create-esm-loader';
export const { resolve, load } = createLoader(config);
```

Subsequently you have to run node as 
```
node --experimental-loader ./path/to/loader.mjs your-file.js
```

Note that in Node 16.12, the loader hooks [have changed](https://nodejs.org/docs/v16.12.0/api/esm.html#esm_loaders).
In previous versions, **including `16.11`**, you had to export `resolve()`, `getFormat()`, `getSource()` and `transformSource()`.
In Node `>=16.12.0`, you have to export `resolve()` and `load()` instead.

`create-esm-loader` is backwards compatible and is able to handle both.
This means that if you're writing a loader that needs to support `<16.12`, you have to export
```js
export const {
  resolve,
  getFormat,
  getSource,
  transformSource,
  load,
} = createLoader(config);
```

ESM loaders must be written in ESM format.
This means that Node needs to interpret it as an ES Module as well, which means you either need to use the `.mjs` extension, or make sure that the nearest `package.json` contains a `{ "type": "module" }` field.
For more info, see https://nodejs.org/api/esm.html#esm_enabling.

### Basic configuration

A basic loader configuration looks like this:
```js
export default {
  resolve(specifier, opts) {
    return { url };
  },
  format(url, opts) {
    return { format };
  },
  fetch(url, opts) {
    return { source };
  },
  transform(source, opts) {
    return { source };
  },
};
```
Those methods used to correspond respectively to the `resolve()`, `getFormat()`, `getSource()` and `transform()` [loader hooks](https://nodejs.org/docs/latest-v14.x/api/esm.html#esm_loaders) from Node, but as mentioned above the `getFormat()`, `getSource()` and `transform()` hooks have now been merged into a single `load()` hook.
The api of this module has not changed as it's explicit goal is to hide how Node handles loaders internally.

Every hook is optional and can be an async function, which is useful if you need to do some async logic within it.
If the hook doesn't return anything, other hooks will be tried until the handling of the hook is given back to Node.

### Advanced configurations

Using the basic loader configuration as a building block, it's possible to create more advanced loader setups.
The structure of a full configuration object looks like this:
```js
const loader = createLoader({
  loaders: [{
    hooks: {
      resolve() {},
      format() {},
      fetch() {},
      transform() {},
    },
    // These options are passed as second argument to the hooks.
    options: {
      foo: 'bar',
    },
  }],
  // Global options, will be overriden by the individual loader options.
  options: {
    foo: 'baz',
  },
});
```

It's also possible to specify an external loader by specifying a string, much like how webpack does it.
```js
const loader = createLoader({
  loaders: [
    'external-loader',
    {
      // If you use absolute paths, they must be urls instead of paths!
      loader: 'file://path/to/another-external-loader.js',
      options: {
        foo: 'bar',
      },
    },
  ],
});
```
The goal of this is that other developers can publish commonly used loaders on npm so that you can easily setup common configurations.

If you only have to configure a single loader, you can use the shorthand
```js
const loader = createLoader({
  resolve() {},
  format() {},
  async transform(source, opts) {
    return { source: await transpile(source) };
  },
});
```

## Combining loaders

It's important to understand that the signature of the loader hooks look like this:
```js
resolve: specifier -> { url }
format: url -> { format }
fetch: url -> { source }
transform: source -> { source }
```
This means that except for the transform hook, every hook returns something fundamentally different than its input.
As a consequence, `resolve()`, `format()` and `fetch()` *will not* loop the entire stack.
Once a hook returns something truthy, the other functions registered for that hook *will not be called*.
As such the order of the loaders is important to take into account.

The only difference here is the transform hook.
If you register multiple transform hooks, they will all be called and properly chained:

```js
function transform(source, ctx) {
  return {
    source: String(source).repeat(2),
  };
}

// Source will be 4 times as big.
createLoader({
  loaders: [ { transform }, { transform } ],
});
```

## Examples
### 1. Compile TypeScript on the fly

```js
const tsLoader = {
  resolve(specifier, opts) {
    if (specifier.endsWith('.ts')) {
      let { parentURL } = opts;
      let url = new URL(specifier, parentURL).href;
      return { url };
    }
  },
  format(url, opts) {
    if (url.endsWith('.ts')) {
      return { format: 'module' };
    }
  },
  transform(source, opts) {
    return {
      source: ts.transpileModule(String(source), {
        compilerOptions: {
          module: ts.ModuleKind.ES2020,
        },
      }),
    };
  },
};
export const {
  resolve,
  getFormat,
  getSource,
  transformSource,
  load,
} = createLoader(tsLoader);

// Usage:
import file from './file.ts';
```

### 2. Create directory aliases

```js
import path from 'path';
import { pathToFileURL } from 'url';

const components = '/path/to/components';
const directoryLoader = {
  resolve(specifier, ctx) {
    if (specifier.startsWith('@components/')) {
      let name = specifier.replace(/^@components\//, '');
      let file = path.join(components, name);
      let url = pathToFileURL(file).href;
      return { url };
    }
  },
};
export const {
  resolve,
  getFormat,
  getSource,
  transformSource,
  load,
} = createLoader(directoryLoader);

// Usage:
import Component from '@components/component.js';
```
