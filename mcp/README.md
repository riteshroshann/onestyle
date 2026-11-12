# Bespoke MCP server

Lets Claude and other MCP clients use Bespoke: ask its guarded adviser, search its guides, and link people into the studio. Full guide: https://riteshroshann.github.io/onestyle/mcp/

```bash
cd mcp && npm install
claude mcp add bespoke -- node /path/to/onestyle/mcp/server.js
```

Tools: `ask_bespoke`, `search_guides`, `studio_link`. Set `BESPOKE_URL` to use another deployment. `npm test` checks the tools over a real stdio connection.

Engineered by Ritesh Roshan.
