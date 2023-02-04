const path = require('path');
const { performScan, generateGraph } = require('@infrascan/sdk');

async function main() {
	const command = process.argv.slice(2);
	if (command.length === 0) {
		console.error(
			'No command given. Use scan to begin a scan of your AWS account, or graph to generate a new infrastructure graph'
		);
		return;
	}
	const config = require(getConfig());
	switch (command[0].toLowerCase()) {
		case 'scan':
			return await performScan(config);
		case 'graph':
			const graphData = generateGraph();
			const mappedServices = graphData.reduce((acc, node) => {
				if (node.data.service) {
					acc.add(node.data.service);
				}
				return acc;
			}, new Set());
			console.log(
				`Graph Complete. Found resources in ${mappedServices.size} services.`
			);
			return;
		default:
			console.error(
				'Unknown command supplied. Currently only graph and scan are supported'
			);
			return;
	}
}

main();
