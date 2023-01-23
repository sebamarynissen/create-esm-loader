import create from 'create-esm-loader';

const loader = await create({
	test: /\.ts/,
	use: 'ts-loader',
});
export const {
	resolve,
	getFormat,
	getSource,
	transformSource,
	load,
} = loader;
