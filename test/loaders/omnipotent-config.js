import create from 'create-esm-loader';

export const {
	resolve,
	getFormat,
	getSource,
	transformSource,
	load,
} = await create({
	test: /\.txt$/,
	use: new URL('./omnipotent-esm-loader.js', import.meta.url).href,
});
