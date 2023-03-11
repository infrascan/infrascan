const fs = require('fs');
const minimatch = require('minimatch');

const OUTPUT_DIR = process.env.OUTPUT_DIR || 'state';
const METADATA_PATH = `./${OUTPUT_DIR}/metadata.json`;
const GRAPH_PATH = `./${OUTPUT_DIR}/graph.json`;

function buildFilePathForServiceCall(account, region, service, functionCall) {
	return `./${OUTPUT_DIR}/${account}-${region}-${service}-${functionCall}.json`;
}

function recordServiceCall(filePath, state) {
	const outputDirExists = fs.existsSync(OUTPUT_DIR);
	if (!outputDirExists) {
		fs.mkdirSync(OUTPUT_DIR);
	}

	return fs.writeFileSync(filePath, JSON.stringify(state, undefined, 2));
}

function resolveStateForServiceCall(account, region, service, functionCall) {
	const filePath = buildFilePathForServiceCall(
		account,
		region,
		service,
		functionCall
	);

	try {
		const state = fs.readFileSync(filePath, 'utf8');
		return JSON.parse(state);
	} catch (_) {
		return [];
	}
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

function readScanMetadata() {
	const metadata = fs.readFileSync(METADATA_PATH, 'utf8');
	return JSON.parse(metadata);
}

function writeScanMetadata(metadata) {
	recordServiceCall(METADATA_PATH, metadata);
}

function writeGraphOutput(graph) {
	recordServiceCall(GRAPH_PATH, graph);
}

module.exports = {
	OUTPUT_DIR,
	buildFilePathForServiceCall,
	getGlobalStateForServiceAndFunction,
	readScanMetadata,
	recordServiceCall,
	resolveStateForServiceCall,
	writeScanMetadata,
	writeGraphOutput,
};
