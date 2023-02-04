const fs = require('fs');
const minimatch = require('minimatch');

const OUTPUT_DIR = process.env.OUTPUT_DIR || 'state';
const METADATA_PATH = `./${OUTPUT_DIR}/metadata.json`;

function buildFilePathForServiceCall(account, region, service, functionCall) {
	return `./${OUTPUT_DIR}/${account}-${region}-${service}-${functionCall}.json`;
}

function recordServiceCall(filePath, state) {
	return fs.writeFileSync(filePath, JSON.stringify(state, undefined, 2));
}

function resolveStateForServiceCall(account, region, service, functionCall) {
	const filePath = buildFilePathForServiceCall(
		account,
		region,
		service,
		functionCall
	);

	const state = fs.readFileSync(filePath, 'utf8');
	return JSON.parse(state);
}

function getGlobalStateForServiceAndFunction(serviceName, functionCall) {
	const directoryContents = fs.readdirSync(OUTPUT_DIR);
	const relevantStateFiles = directoryContents.filter((fileName) =>
		minimatch(fileName, `*-*-${serviceName}-${functionCall}.json`)
	);

	return relevantStateFiles.flatMap((fileName) => {
		const state = fs.readFileSync(`./${OUTPUT_DIR}/${fileName}`, 'utf8');
		return JSON.parse(state);
	});
}

module.exports = {
	OUTPUT_DIR,
	METADATA_PATH,
	buildFilePathForServiceCall,
	getGlobalStateForServiceAndFunction,
	recordServiceCall,
	resolveStateForServiceCall,
};
