import { logger } from './Logger.js';
import { Api } from './Api.js';
import { SERVER_PORT } from './Constants.js';

async function main() {
    logger.info(`Initializing`);

    const api = new Api(
    );

    logger.info(`Launching API...`);

    await api.start();

    logger.info(`API running on 127.0.0.1:${SERVER_PORT}`);
}

main();
