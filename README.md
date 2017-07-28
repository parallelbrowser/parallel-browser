# Parallel

A custom web browser built in Electron giving users access to a "parallel Internet."
* Would be highly customizable and support a user community.
* Useful for quickly finding/filtering related webpages and information

## Features
* Will use Webhose.io and Algolia APIs to find web content related to the current page metadata
* Collapsible sidebars specific to each URL/domain:
  - "Suggestions" links/previews of related content
  - "Conversations": rich comment threads 
  - "Minipages": small user-created webpages
* Tracking/filtering utilities for sidebar items
* Interaction with the underlying webpage DOM via approved scripts
* A separate Tor hidden service (to allow whistleblowers and political dissidents to participate without fear of being tracked)


## Resources
https://blog.jscrambler.com/building-a-web-browser-using-electron/
https://electron.atom.io/docs/api/browser-window/
https://medium.com/@ccnokes/deep-dive-into-electrons-main-and-renderer-processes-7a9599d5c9e2
https://electron.atom.io/docs/api/ipc-main/
https://electron.atom.io/docs/api/remote/
https://electron.atom.io/docs/api/web-contents/


### Rough wireframes below...
## Possible Data Flow for Getting Suggestions
![Suggestions Backend](./img/server.png?raw=true "Sample Usage")

## Possible Data Flow For Suggestions
![Suggestions Backend](./img/suggestion.png?raw=true "Suggestions")

## Possible Data Flow For Conversations
![Suggestions Backend](./img/conversation.png?raw=true "Suggestions")
