const { performScan } = require('@infrascan/sdk');
const {
	buildFilePathForServiceCall,
	recordServiceCall,
	resolveStateForServiceCall,
} = require('../utils');
const DEFAULT_CONFIG_PATH = 'config.default.json';

function getConfig() {
	const givenPath = process.env.CONFIG_PATH ?? DEFAULT_CONFIG_PATH;
	return path.join(process.env.PWD, givenPath);
}

function writeStateToFs(account, region, service, functionName, functionState) {
	const filePath = buildFilePathForServiceCall(
		account,
		region,
		service,
		functionName
	);
	recordServiceCall(filePath, functionState);
}

async function runScan() {
	const scanConfig = require(getConfig());
	for (let accountConfig of scanConfig) {
		// Resolving credentials is left up to the SDK — performing a full scan can take some time, so the SDK may need to refresh credentials.
		const { profile, roleToAssume, regions, services } = accountConfig;
		const scanMetadata = await performScan({
			profile,
			roleToAssume,
			regions,
			services,
			onServiceScanComplete: writeStateToFs,
			resolveStateForServiceCall,
		});
	}
}

module.exports = runScan;
