// # anything.js
import create from 'create-esm-loader';

const loader = new URL('./extension-hooks.js', import.meta.url).href;
export const { resolve, getFormat, getSource, load } = create([{
	loader,
	options: {
		extensions: ['.es'],
	},
}]);
