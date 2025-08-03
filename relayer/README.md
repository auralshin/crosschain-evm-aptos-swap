# Cross-Chain EVM to Aptos Swap Resolver

A TypeScript service for handling cross-chain swaps between EVM-compatible blockchains and the Aptos blockchain.

## Features

- Cross-chain swap coordination
- EVM and Aptos blockchain integration
- Type-safe TypeScript implementation
- Modern development tooling

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Git

### Installation

1. Clone the repository and navigate to the resolver directory:
```bash
cd resolver
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

### Development

```bash
# Start development server with hot reload
npm run dev

# Build the project
npm run build

# Run the built project
npm start

# Run tests
npm test

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

### Project Structure

```
src/
├── index.ts          # Main entry point
├── services/         # Business logic services
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
└── config/          # Configuration files

dist/                # Compiled JavaScript output
tests/               # Test files
```

## Environment Variables

Create a `.env` file in the root directory:

```bash
NODE_ENV=development
PORT=3000

# EVM Chain Configuration
EVM_RPC_URL=
EVM_PRIVATE_KEY=

# Aptos Configuration
APTOS_RPC_URL=
APTOS_PRIVATE_KEY=

# Database
DATABASE_URL=
```

## License

MIT
