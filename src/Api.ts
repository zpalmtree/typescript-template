import express, { Request, Response } from 'express';
import { Server } from 'http';
import cors from 'cors';
import { match } from 'path-to-regexp';
import fetch from 'node-fetch';
import * as fs from 'fs/promises';
import * as url from 'url';
import { v4 as uuidv4 } from 'uuid';

import {
    RouteData,
    ApiMethod,
    ApiRoute,
} from './Types.js';
import { logger } from './Logger.js';
import {
    CORS_WHITELIST,
    SERVER_PORT,
} from './Constants.js';

export class Api {
    private httpServer = express();

    private runningServer: Server | undefined;

    private running: boolean = false;

    private routeData: RouteData[] = [
        {
            path: '/',
            routeImplementation: this.getStatus,
            method: ApiMethod.GET,
            description: 'Check the API is online',
        },
    ];

    private handlers: ApiRoute[];

    private handlerMap: Map<string, ApiRoute>;

    constructor(
    ) {
        this.handlers = this.routeData.map((r) => {
            return {
                ...r,
                routeMatchTest: match(r.path, { decode: decodeURIComponent }),
            };
        });

        this.handlerMap = new Map(this.handlers.map((h) => [`${h.path}-${h.method}`, h]));
    }

    public async getStatus(req: Request, res: Response) {
        return res.status(200).json({
            status: 'ok',
        });
    }

    public async start() {
        if (!this.running) {
            await this.init();
        }

        this.running = true;

        return new Promise<void>((res) => {
            this.runningServer = this.httpServer.listen(SERVER_PORT, () => res());
        });
    }

    public async stop() {
        if (this.running) {
            await new Promise<void>((res) => {
                if (this.runningServer) {
                    this.runningServer.close(() => res());
                }
            });

            this.running = false;
        }
    }

    /* PRIVATE FUNCTIONS */

    private async init() {
        const corsOptions = {
            origin: function (origin: string | undefined, callback: (err: null | Error, next?: boolean) => void) {
                if (!origin || CORS_WHITELIST.includes(origin) || origin.startsWith('http://localhost')) {
                    callback(null, true)
                } else {
                    logger.error(`Request with origin of ${origin} is not allowed by CORS!`);
                    callback(new Error('Not allowed by CORS'))
                }
            }
        }

        this.httpServer.set('trust proxy', true);

        /* Enable cors for requests */
        this.httpServer.use(cors(corsOptions));

        /* Enable cors for all options requests */
        this.httpServer.options('*', cors(corsOptions));

        /* Log request info */
        this.httpServer.use(this.asyncWrapper(this.loggingMiddleware.bind(this)));

        /* API Key middleware etc. Note, has to be listed BEFORE handlers */
        this.httpServer.use(this.asyncWrapper(this.guardMiddleware.bind(this)));

        /* Parse bodies as json */
        this.httpServer.use(express.json({ limit: '100MB' }));

        /* Attach handlers */
        for (const handler of this.handlers) {
            const boundFunc = this.asyncWrapper(handler.routeImplementation.bind(this));

            switch (handler.method) {
                case ApiMethod.GET: {
                    this.httpServer.get(handler.path, boundFunc);
                    break;
                }
                case ApiMethod.POST: {
                    this.httpServer.post(handler.path, boundFunc);
                    break;
                }
                case ApiMethod.PUT: {
                    this.httpServer.put(handler.path, boundFunc);
                    break;
                }
                case ApiMethod.DELETE: {
                    this.httpServer.delete(handler.path, boundFunc);
                    break;
                }
                default: {
                    throw new Error(`Unsupported method type ${handler.method} in attachHandlers!`);
                    break;
                }
            }
        }

        /* Error handler. Note, has to be listed AFTER handlers. Also, only catches synchronous errors. */
        this.httpServer.use((err: any, req: Request, res: Response, _next: (err?: any) => void) => {
            if (err.query) {
                logger.error(err, err.query);
            } else {
                logger.error(err);
            }

            res.status(500).send({
                error: err.toString(),
            });
        });
    }

    /* Handles catching rejected promises and sending them to the error handler */
    private asyncWrapper(fn: (req: Request, res: Response, next: (err?: any) => void) => void) {
        return (req: Request, res: Response, next: (err?: any) => void) => {
            Promise.resolve(fn(req, res, next)).catch(next);
        };
    }

    private async guardMiddleware(req: Request, res: Response, next: (err?: any) => void) {
        /* OPTIONS requests do not include credentials, we need to permit them
         * regardless */
        if (req.method === 'OPTIONS') {
            next();
            return;
        }

        let path = undefined;
        let routeInfo = undefined;

        for (const handler of this.handlers) {
            if (handler.routeMatchTest(req.path) && handler.method === req.method) {
                path = handler.path;
                routeInfo = handler;
                break;
            }
        }

        if (!routeInfo || req.method !== routeInfo.method || !path) {
            res.status(404).send({
                error: 'Unknown route',
            });

            return;
        }

        if (routeInfo.guards) {
            for (const guard of routeInfo.guards) {
                const {
                    accessPermitted,
                    error,
                    statusCode,
                } = await guard(req, res, path, req.method);

                if (!accessPermitted) {
                    res.status(statusCode!).send({
                        error: error!,

                    });

                    return;
                }
            }
        }

        next();
    }

    private async loggingMiddleware(req: Request, res: Response, next: (err?: any) => void) {
        let ip = req.ip!;

        if (ip.substr(0, 7) == '::ffff:') { // fix for if you have both ipv4 and ipv6
            ip = ip.substr(7);
        }

        logger.info(`Recieved request for ${req.method} ${req.path} from ${ip}`);

        next();
    }
}
