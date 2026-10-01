module.exports = {
  apps: [{
    name: 'bunon-site',
    script: './dist/server.cjs',
    cwd: '/www/wwwroot/bunon.shop',
    interpreter: '/www/server/nvm/versions/node/v24.18.0/bin/node',
    node_args: ['--max-old-space-size=512'],
    env: {
      NODE_ENV: 'production',
      PORT: 5001
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5001
    }
  }]
};
