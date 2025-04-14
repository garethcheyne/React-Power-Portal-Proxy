# Implementing JSON/API Function in Power Page Portal

## Setup in Your Power Page Portal

### Step 1: Create a Web Template

1. Navigate to **Web Templates** in your Power Page Portal.
2. Click on **New** to create a new web template.
3. Set the **Name** to `APIJSONTemplate`.
4. Set the **MIME Type** to `application/json`.
5. Add your JSON or API logic in the **Source** field.
6. Save the template.

### Step 2: Create a Page Template

1. Navigate to **Page Templates**.
2. Click on **New** to create a new page template.
3. Set the **Name** to `APIPageTemplate`.
4. In the **Web Template** field, select `APIJSONTemplate`.
5. Ensure that **Include Header** and **Include Footer** are unchecked.
6. Save the page template.

### Step 3: Create a Web Page

1. Navigate to **Web Pages**.
2. Click on **New** to create a new web page.
3. Set the **Name** to `WhoAmI`.
4. In the **Page Template** field, select `APIPageTemplate`.
5. Add any additional settings or content as needed.
6. Save the web page.

Now, your Power Page Portal is set up to handle JSON/API functions using the `WhoAmI` endpoint as an example.
