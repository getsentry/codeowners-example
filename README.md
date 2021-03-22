## About
This repo is an example of how to upload your CODEOWNERS file to Sentry using the API.

## Getting Started
```
git clone https://github.com/getsentry/codeowners-example.git
cd codeowners-example
cp .env.example .env
npm install
npm start
```

1. Edit the newly created `.env` file with your own credentials.
2. Edit the `team_map.json` with your own team mapping.
3. Edit the `user_map.json` with your own user mapping.
4. Overwrite `.github/CODEOWNERS` with your own `CODEOWNERS` file.