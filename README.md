# Parallel

A custom web browser built in Electron giving users access to a "parallel Internet."
* Would be highly customizable and support a user community.
* Useful for quickly finding/filtering related webpages and information

## Features
* Can track the user's URL and scrape metadata from webpage
* Will use the Webhose.io and Algolia APIs to find web content related to the page
* A collapsible/filterable "Suggestions" sidebar with links to related content
* A collapsible "Conversations" sidebar with comment threads specific to each URL or domain
* Interaction with the underlying webpage DOM
  * (i.e., clicking a user comment could jump to quoted text on the page)
* Ability to track and filter trending Conversations
* A separate Tor hidden service
  * (to allow whistleblowers and political dissidents to participate without being tracked)

### Rough wireframes below...
## Possible Data Flow for Getting Suggestions
![Suggestions Backend](./img/server.png?raw=true "Sample Usage")

## Possible Data Flow For Suggestions
![Suggestions Backend](./img/suggestions.png?raw=true "Suggestions")

## Possible Data Flow For Conversations
![Suggestions Backend](./img/conversations.png?raw=true "Suggestions")
