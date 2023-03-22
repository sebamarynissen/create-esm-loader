import create from 'create-esm-loader';

const loader = await create({
	test: /\.csv$/,
	type: 'asset/resource',
});
export const {
	resolve,
	getFormat,
	getSource,
	transformSource,
	load,
} = loader;
