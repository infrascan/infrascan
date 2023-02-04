const { generateGraph } = require('@infrascan/sdk');
const {
	resolveStateForServiceCall,
	getGlobalStateForServiceAndFunction,
	readScanMetadata,
} = require('../utils');

async function runGraph() {
	const scanMetadata = readScanMetadata();
	const graphData = generateGraph({
		scanMetadata,
		resolveStateForServiceCall,
		getGlobalStateForServiceAndFunction,
	});
	const mappedServices = graphData.reduce((acc, node) => {
		if (node.data.service) {
			acc.add(node.data.service);
		}
		return acc;
	}, new Set());
	console.log(
		`Graph Complete. Found resources in ${mappedServices.size} services.`
	);
}

module.exports = runGraph;
