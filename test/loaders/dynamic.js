import create from 'create-esm-loader';

const loader = await create({
	loaders: [{
		loader: new URL('./dynamic-dep.js', import.meta.url).href,
	}],
});
export const {
	resolve,
	getFormat,
	getSource,
	transformSource,
	load,
} = loader;
