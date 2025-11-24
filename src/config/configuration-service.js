/**
 * Configuration Service for RAG Service
 */
class ConfigurationService {
    config = {};
    constructor() {
        // Load default configuration
        this.config = {
            // RAG settings
            RAG_TOP_K: parseInt(process.env.RAG_TOP_K || '5'),
            RAG_SIMILARITY_THRESHOLD: parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.6'),
            // LLM for embeddings
            EMBEDDING_LLM_MODEL: process.env.EMBEDDING_LLM_MODEL || 'openai/text-embedding-3-small',
            EMBEDDING_TYPE: process.env.EMBEDDING_TYPE || 'openai', // openai, voyage, etc.
            // Vector database settings
            VECTOR_DATABASE: process.env.VECTOR_DATABASE || 'qdrant', // qdrant, lancedb, etc.
            QDRANT_URL: process.env.QDRANT_URL || 'http://54.37.225.188:6333',
            QDRANT_COLLECTION: process.env.QDRANT_COLLECTION || 'code_examples',
            // OpenRouter settings (for embeddings)
            OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
            OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
            // Environment
            LOG_LEVEL: process.env.LOG_LEVEL || 'info',
            NODE_ENV: process.env.NODE_ENV || 'development',
        };
    }
    get(key, defaultValue) {
        return this.config[key] !== undefined ? this.config[key] : defaultValue;
    }
    getEnv(key, defaultValue) {
        return process.env[key] || defaultValue || '';
    }
    getEnvironment() {
        return {
            nodeEnv: this.config.NODE_ENV,
        };
    }
    validate() {
        return { warnings: [], errors: [] };
    }
    set(key, value) {
        this.config[key] = value;
    }
}
// Export singleton instance
export const defaultConfig = new ConfigurationService();
//# sourceMappingURL=configuration-service.js.map