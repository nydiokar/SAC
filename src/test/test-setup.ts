import { register } from 'ts-node';

register({
    transpileOnly: true,
    compilerOptions: {
        module: 'commonjs',
        moduleResolution: 'node',
        target: 'es2017',
        esModuleInterop: true
    }
});
