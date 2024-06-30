import { Request, Response } from 'express';

export interface GuardResult {
    accessPermitted: boolean;

    error?: string;

    statusCode?: number;
}

export type ApiKeyGuard = (req: Request, res: Response, endpoint: string, method: string) => Promise<GuardResult>;

export enum ApiMethod {
    POST = 'POST',
    PUT = 'PUT',
    GET = 'GET',
    DELETE = 'DELETE',
}

export interface RouteData {
    /* Path of the api route, e.g. /stats */
    path: string;

    /* Description of what the route does */
    description: string;

    /* Function that handles when someone hits this route */
    routeImplementation: (req: Request, res: Response) => void;

    method: ApiMethod;

    /* Various functions the request must pass to access this route, e.g. api key */
    guards?: ApiKeyGuard[];
}

export interface ApiRoute extends RouteData {
    routeMatchTest: (r: string) => any;
}

export interface Endpoint {
    path: string;

    method: string;
}
