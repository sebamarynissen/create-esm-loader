import create from 'create-esm-loader';
const config = {
	resolve() {},
	transform() {},
};

export function transform(source) {
	let obj = { foo: 'bar' };
	return `export default ${JSON.stringify(obj)}`;
};

export const { resolve, getFormat, getSource, transformSource, load } = await create({});
