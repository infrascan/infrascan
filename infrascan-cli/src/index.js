const { runGraph, runScan } = require('./commands');

async function main() {
	const command = process.argv.slice(2);
	if (command.length === 0) {
		console.error(
			'No command given. Use scan to begin a scan of your AWS account, or graph to generate a new infrastructure graph'
		);
		return;
	}
	switch (command[0].toLowerCase()) {
		case 'scan':
			return await runScan();
		case 'graph':
			return await runGraph();
		default:
			console.error(
				'Unknown command supplied. Currently only graph and scan are supported'
			);
			return;
	}
}

main();
