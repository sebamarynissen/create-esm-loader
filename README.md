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

```npm install --save-dev create-esm-loader```

but you guessed that, right?

## Usage

`create-esm-loader` is inspired by Webpack.
You can pass it a configuration object and it will return a set of [loader hooks](https://nodejs.org/api/esm.html#hooks) which you then have to export manually.
This typically looks like
```js
// loader.js
import createLoader from 'create-esm-loader';
export const { resolve, load } = await createLoader(config);
```

Subsequently you have to run node as 
```
node --experimental-loader ./path/to/loader.mjs your-file.js
```

On Node 20.7 however [it is discouraged](https://nodejs.org/dist/latest-v20.x/docs/api/cli.html#--experimental-loadermodule) to use the `--experimental-loader` flag, and instead you should use `--import` in combination with `register()` from `node:module`
```sh
node --import ./register.js your-file.js
```
```js
// register.js
import { register } from 'node:module';
register('./path/to/loader.mjs', import.meta.url);
```

Also have a look at [node-esm-loader](https://www.npmjs.com/package/node-esm-loader), which is built on top of this package and allows you to simply do
```sh
node --import node-esm-loader/register your-file.js
```

### Node 16.11 and lower

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
} = await createLoader(config);
```

ESM loaders must be written in ESM format.
This means that Node needs to interpret it as an ES Module as well, which means you either need to use the `.mjs` extension, or make sure that the nearest `package.json` contains a `{ "type": "module" }` field.
For more info, see https://nodejs.org/api/esm.html#esm_enabling.

### Basic configuration

A basic loader configuration looks like this:
```js
const config = {
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

### Webpack support

Since version 0.2.0, *experimental* support for Webpack like configurations has been added.
The goal of this is to make it easier to create loaders that do a simple source transform and to provide support for existing webpack loaders, such as `ts-loader`.
This means that you can write your loaders as
```js
const config = {
  loaders: [{
    test: /\.csv$/,
    use: [
      {
        loader: 'csv-loader',
        options: {},
      },
    ],
  }],
};
export default config;
export const { resolve, load } = await createLoader(config);
```
Under the hood this will be translated to a `{ resolve, format, fetch, transform }` configuration that is functionally equivalent.

There is also support for Webpack's [asset modules](https://webpack.js.org/guides/asset-modules/):

```js
const config = {
  loaders: [{
    test: /\.(png|gif|jpe?g)$/,
    
    // Supports all 3 asset types.
    type: 'asset/resource',
    type: 'asset/inline',
    type: 'asset/source',

  }],
};
```

**IMPORTANT** When using *existing* webpack loaders, it is important that the loader's source transform returns an *ES module*!
This is a limitation of [how loader hooks work in Node](https://nodejs.org/api/esm.html#loadurl-context-nextload).
This means that if you want to use Webpack's `ts-loader` for example, you have to configure it to output ESM in `tsconfig.json`!

```js
{
  "compilerOptions": {
    "module": "es2020"
  }
}
```

### Node `^16.12`

If you only target node 16.12 and above, you can simplify your life a bit by specifying the format in the `resolve()` hook, omitting the need for a separate `format()` hook.
```js
// Will not work in Node < 16.12!!
export const { resolve, load } = await createLoader({
  resolve(specifier, opts) {
    let url = new URL(specifier, opts.parentURL);
    if (url.pathname.endsWith('.vue')) {
      return {
        format: 'module',
        url: url.href,
      };
    }
  },
});
```

### Advanced configurations

Using the basic loader configuration as a building block, it's possible to create more advanced loader setups.
The structure of a full configuration object looks like this:
```js
export const { resolve, load } = await createLoader({
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
export const { resolve, load } = await createLoader({
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
export const { resolve, load } = await createLoader({
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

## Standalone vs composable loaders

The primary goal of this module is to make it easier to simultaneously use multiple loaders.
Therefore, if you're writing a loader that is meant to be used by other people, the preferred pattern is
```js
import createLoader from 'create-esm-loader';

const config = {
  resolve() {},
  transform() {},
};
export default config;

export const {
  resolve,
  getFormat,
  getSource,
  transformSource,
  load,
} = await createLoader(config);
```
Using this approach, the loader can be used as a standalone loader with `node --experimental-loader=your-loader file.js`, but also in combination with another one
```js
import createLoader from 'create-esm-loader';

export const { resolve, load } = await createLoader([
  'your-loader',
  'someone-elses-loader',
  {
    resolve() {},
    transform() {},
  },
]);
```
If you use [node-esm-loader](https://npmjs.com/package/node-esm-loader), this can even be simplified to
```js
// .loaderrc.js
export default [
  'your-loader',
  {
    loader: 'someone-elses-loader',
    options: {},
  },
];
```
with `node --experimental-loader=node-esm-loader`.

## Examples
### 1. Compile TypeScript on the fly

```js
import createLoader from 'create-esm-loader'
import ts from 'typescript'

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
    const { url } = opts
    if (url.endsWith('.ts')) {
      const { outputText } = ts.transpileModule(String(source), {
        compilerOptions: {
          module: ts.ModuleKind.ES2020,
        },
      })
      return { source: outputText };
    }
  },
};
export const { resolve, load } = await createLoader(tsLoader);

// Usage:
import file from './file.ts';
```

### 2. Use a third-party loader in combination with asset modules

```js
export const { resolve, load } = await createLoader({
  loaders: [
    'vue-esm-loader',
    {
      test: /\.(png|gif|jpe?g|svg)$/,
      type: 'asset/resource',
    },
  ],
});
```

### 3. Create directory aliases

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
export const { resolve, load } = await createLoader(directoryLoader);

// Usage:
import Component from '@components/component.js';
```

### 4. Loaders in the Wild

You can find an active [list of loaders][loaderlist] that use
`create-esm-loader`, here:

[loaderlist]: https://www.npmjs.com/package/create-esm-loader?activeTab=dependents

