const { generateGraph } = require('@infrascan/sdk');
const {
	resolveStateForServiceCall,
	getGlobalStateForServiceAndFunction,
	readScanMetadata,
	writeGraphOutput,
} = require('../utils');

async function runGraph() {
	const scanMetadata = readScanMetadata();
	console.log(scanMetadata);
	const graphData = await generateGraph({
		scanMetadata,
		resolveStateForServiceCall,
		getGlobalStateForServiceAndFunction,
	});
	const mappedServices = graphData.reduce((acc, node) => {
		if (node?.data?.service) {
			acc.add(node.data.service);
		}
		return acc;
	}, new Set());
	console.log(
		`Graph Complete. Found resources in ${mappedServices.size} services.`
	);
	writeGraphOutput(graphData);
}

module.exports = runGraph;
