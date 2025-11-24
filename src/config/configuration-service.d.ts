/**
 * Configuration Service for RAG Service
 */
export interface IConfigurationService {
    get(key: string, defaultValue?: any): any;
    getEnv(key: string, defaultValue?: string): string;
    getEnvironment(): {
        nodeEnv: string;
    };
    validate(): {
        warnings: string[];
        errors: string[];
    };
    set(key: string, value: any): void;
}
declare class ConfigurationService implements IConfigurationService {
    private config;
    constructor();
    get(key: string, defaultValue?: any): any;
    getEnv(key: string, defaultValue?: string): string;
    getEnvironment(): {
        nodeEnv: string;
    };
    validate(): {
        warnings: string[];
        errors: string[];
    };
    set(key: string, value: any): void;
}
export declare const defaultConfig: ConfigurationService;
export {};
//# sourceMappingURL=configuration-service.d.ts.map