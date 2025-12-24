# Overall context:

I run LibreChat: https://github.com/danny-avila/LibreChat as a managed service for law firms. I have my own legal deep research agent that I expose as a tool call so that lawyers can use it in conjunction with LLMs in their daily workflows. 

# Present challenge

I need to create an efficient way to setup multiple accounts at once. Currently, I run: `docker-compose exec api npm run create-user` everytime and manually setup accounts by answering the prompts that follow (email, password, etc)

I want to be able to supply a .txt file and then their accounts ought to be created. But email has first name only. SO before creation, you have to web search the first name and the firm name (D. L. & F. De Saram Law Firm) to find their full names and fill that next to the emails.

