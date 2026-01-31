Steps took/Decisions made during project building:



**1.** Choose TypeScript over JavaScript for building the Extension.



**2.** Chose the File Structure to use for the project files storage.



**3.** ***Issue***: There was a issue in background.ts file, that is type script had no idea what “message” type  was, so it was assigned ‘any’ type which turns the TypeScript off for that variable.

So it couldn’t: 

❌ Autocomplete for message.type

❌ Autocomplete for message.payload

❌ Catch typos like message.paylod

❌ Warn if payload is missing or wrong

❌ Enforce that type is "TRACK\_PROGRESS"



***Fix***: Define Message Types Centrally:

⦁ Don’t define message interfaces inline in background.ts

⦁ Create a file src/core/messages.ts 

⦁ In background.ts, imported messages.ts and used it for message type.



4\. ***Issue: The "chrome" global does not exist in standard JS/TS typings, that is missing chrome type definations from TypeScript.

Fix:*** 

***a.*** Installed Types/@chrome definations for TypeScript so that it can use: 

* chrome.runtime
* chrome.storage
* chrome.tabs
* etc.

***b.*** Created tsconfig.json, it defines the various characteristics and details of the application.

5. ***Issue: Error faced while loading the unpacked extension,*** because I haven’t built TypeScript → JavaScript, so the dist/ folder doesn’t exist. And Chrome extensions cannot run TypeScript. They only load plain JavaScript.



***Fix:***

***a. Add/Updated package.json, which describes all the details about the extension  like:***

* ***What is this project?***
* ***What tools does it need?***
* ***What commands can I run?***

b. build the project using: 

* npm install
* npm run build 



6\. Successfully Loaded the Extension on browser

