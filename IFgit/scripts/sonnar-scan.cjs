require('dotenv').config();
const { scan } = require('@sonar/scan');

const SONAR_HOST_URL = process.env.SONAR_HOST_URL;
const SONAR_TOKEN = process.env.SONAR_TOKEN;
const SONAR_BASE_KEY = process.env.SONAR_PROJECT_KEY;

if (!SONAR_HOST_URL || !SONAR_TOKEN || !SONAR_BASE_KEY) {
    console.error('ERROR:: Missing required SONAR env variables');
    process.exit(1);
}

function getProjectKey(module) {
    return `${SONAR_BASE_KEY}-${module}`;
}

async function runScan(module, config) {
    const projectKey = getProjectKey(module);
    const projectName = `${SONAR_BASE_KEY} :: ${module.toUpperCase()}`;
    console.log(`SCAN:: ${module}...`);
    await scan({
        serverUrl: SONAR_HOST_URL,
        token: SONAR_TOKEN,
        options: {
            'sonar.projectKey': projectKey,
            'sonar.projectName': projectName,
            'sonar.projectBaseDir': config.baseDir,
            'sonar.sources': config.sources,
            'sonar.exclusions': config.exclusions,
            ...config.extraOptions,
        },
    });
    console.log(`SUCCESS:: ${module} scan complete`);
}

(async () => {
    try {
        console.log('START:: Running full Sonar scans...');
        await runScan('frontend', {
            baseDir: 'frontend',
            sources: 'src',
            exclusions: 'node_modules/**,build/**,dist/**',
        });

        await runScan('backend', {
            baseDir: 'backend',
            sources: '.',
            exclusions: '__pycache__/**,venv/**',
        });

        console.log('PASS:: All scans completed successfully');
        process.exit(0);
    } catch (err) {
        console.error('ERROR:: Sonar scan failed');
        console.error(err);
        process.exit(1);
    }
})();