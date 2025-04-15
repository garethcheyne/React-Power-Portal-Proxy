# Using Liquid in Power Portals to Generate JSON

## Introduction

Power Pages (formerly Power Portal) provides a way to expose Dataverse data on the web, but often developers need more flexibility to build modern, reactive front-ends with frameworks like React. This guide shows you how to create dynamic JSON endpoints using Liquid templates within your Power Portal, which can then be consumed by React components through this Power Portal Proxy.

## Prerequisites

- Access to a Power Pages portal with administrative permissions
- Basic understanding of Liquid templating
- Familiarity with JSON structure
- React frontend development experience
- This Power Portal Proxy set up and running

## Step 1: Create a Liquid Template Web Page

Start by creating a new web page in your Power Pages portal that will serve as your JSON endpoint.

1. Go to your Power Pages portal admin area
2. Navigate to Content > Web Pages
3. Click "New" to create a new web page
4. Give it a clear name that indicates it's a JSON endpoint (e.g., "API - Products")
5. Set the partial URL to something descriptive (e.g., "/api/products")
6. Under Web Template, select "Create a new Web Template"
7. Name the template appropriately (e.g., "API Products JSON")
8. For the template source, use Liquid to generate JSON (example provided below)

## Step 2: Set Correct Content Type

It's crucial to set the correct HTTP content type for your JSON response. Add this at the top of your Liquid template:

```liquid
{% assign contentType = "application/json" %}
```

This tells the browser that the content should be interpreted as JSON, not HTML. The proxy will automatically detect and properly handle this content type.

## Step 3: Structure Your JSON with Liquid

Here's an example of a Liquid template that generates a JSON array of products:

```liquid
{% assign contentType = "application/json" %}
[
  {% fetchxml products %}
  <fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false">
    <entity name="product">
      <attribute name="productid" />
      <attribute name="name" />
      <attribute name="description" />
      <attribute name="price" />
      <attribute name="createdon" />
      <order attribute="name" descending="false" />
    </entity>
  </fetch>
  {% endfetchxml %}

  {% for product in products.results.entities %}
    {
      "id": "{{ product.productid }}",
      "name": "{{ product.name | escape }}",
      "description": "{{ product.description | escape }}",
      "price": {{ product.price | default: 0 }},
      "createdOn": "{{ product.createdon }}"
    }{% unless forloop.last %},{% endunless %}
  {% endfor %}
]
```

This template retrieves product records from Dataverse using FetchXML and formats them as a JSON array. Note the comma handling between items using the `unless forloop.last` condition.

## Step 4: Add Query Parameters Support (Optional)

You can make your endpoints more flexible by supporting query parameters:

```liquid
{% assign contentType = "application/json" %}
{% assign category = request.params.category %}
{% assign maxItems = request.params.limit | default: 50 %}

[
  {% fetchxml products %}
  <fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false" count="{{ maxItems }}">
    <entity name="product">
      <attribute name="productid" />
      <attribute name="name" />
      <attribute name="price" />
      {% if category != empty %}
      <filter type="and">
        <condition attribute="productcategoryid" operator="eq" value="{{ category }}" />
      </filter>
      {% endif %}
    </entity>
  </fetch>
  {% endfetchxml %}
  
  // Rest of the JSON formatting
]
```

This example accepts optional `category` and `limit` parameters that can be used like: `/api/products?category=123&limit=10`

## Step 5: Validate Your JSON

Common JSON errors when using Liquid templates:

- Missing commas between array items
- Extra trailing commas (not allowed in JSON)
- Unescaped special characters in strings
- Unclosed quotes or brackets

Always validate your JSON output with a tool like [JSONLint](https://jsonlint.com/) before using it in your application.

## Step 6: Set Up Page Permissions

Configure appropriate page permissions:

1. In the portal admin area, go to Security > Page Permissions
2. Add a new Page Permission for your JSON endpoint
3. Select whether this endpoint requires authentication or should be publicly accessible
4. If restricted, assign appropriate web roles

## Step 7: Configure CORS (If Needed)

If your React application is hosted on a different domain than your Power Portal, you'll need to handle CORS. The Power Portal Proxy included in this project can help you overcome this limitation by proxying requests to your portal.

## Step 8: Sample JSON Templates

### Basic Entity List

```liquid
{% assign contentType = "application/json" %}
{% fetchxml accounts %}
<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false" count="10">
  <entity name="account">
    <attribute name="name" />
    <attribute name="accountid" />
    <attribute name="emailaddress1" />
    <attribute name="telephone1" />
    <order attribute="name" descending="false" />
  </entity>
</fetch>
{% endfetchxml %}
{
  "accounts": [
    {% for account in accounts.results.entities %}
    {
      "id": "{{ account.accountid }}",
      "name": "{{ account.name | escape }}",
      "email": "{{ account.emailaddress1 | default: "" | escape }}",
      "phone": "{{ account.telephone1 | default: "" | escape }}"
    }{% unless forloop.last %},{% endunless %}
    {% endfor %}
  ]
}
```

### Current User Information

```liquid
{% assign contentType = "application/json" %}
{
  "user": {
    "authenticated": {% if user %} true {% else %} false {% endif %},
    {% if user %}
    "id": "{{ user.id }}",
    "name": "{{ user.fullname | escape }}",
    "email": "{{ user.email | escape }}",
    "roles": [
      {% for role in user.roles %}
      "{{ role.name | escape }}"{% unless forloop.last %},{% endunless %}
      {% endfor %}
    ]
    {% endif %}
  }
}
```

### Nested Data with Relationships

```liquid
{% assign contentType = "application/json" %}
{% fetchxml orders %}
<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false">
  <entity name="salesorder">
    <attribute name="salesorderid" />
    <attribute name="ordernumber" />
    <attribute name="totalamount" />
    <attribute name="createdon" />
    <link-entity name="account" from="accountid" to="customerid" link-type="outer">
      <attribute name="accountid" alias="customer_id" />
      <attribute name="name" alias="customer_name" />
    </link-entity>
    <link-entity name="salesorderdetail" from="salesorderid" to="salesorderid">
      <attribute name="salesorderdetailid" alias="line_id" />
      <attribute name="productid" alias="line_product_id" />
      <attribute name="productdescription" alias="line_description" />
      <attribute name="quantity" alias="line_quantity" />
      <attribute name="priceperunit" alias="line_price" />
    </link-entity>
  </entity>
</fetch>
{% endfetchxml %}

{% assign grouped_orders = orders.results.entities | group_by: "salesorderid" %}

[
  {% for order_group in grouped_orders %}
    {% assign first_order = order_group[1] | first %}
    {
      "id": "{{ first_order.salesorderid }}",
      "orderNumber": "{{ first_order.ordernumber }}",
      "total": {{ first_order.totalamount | default: 0 }},
      "createdOn": "{{ first_order.createdon }}",
      "customer": {
        "id": "{{ first_order.customer_id }}",
        "name": "{{ first_order.customer_name | escape }}"
      },
      "items": [
        {% for item in order_group[1] %}
          {
            "id": "{{ item.line_id }}",
            "productId": "{{ item.line_product_id }}",
            "description": "{{ item.line_description | escape }}",
            "quantity": {{ item.line_quantity | default: 0 }},
            "price": {{ item.line_price | default: 0 }}
          }{% unless forloop.last %},{% endunless %}
        {% endfor %}
      ]
    }{% unless forloop.last %},{% endunless %}
  {% endfor %}
]
```

## Step 9: Consuming from React

To consume your Liquid-generated JSON in a React application:

```javascript
import { useState, useEffect } from 'react';

function ProductList() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function fetchProducts() {
      try {
        // The proxy will handle the request to your Power Portal
        const response = await fetch('/api/products');
        const data = await response.json();
        setProducts(data);
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchProducts();
  }, []);
  
  if (loading) return <p>Loading...</p>;
  
  return (
    <div>
      <h1>Products</h1>
      <ul>
        {products.map(product => (
          <li key={product.id}>
            <h2>{product.name}</h2>
            <p>{product.description}</p>
            <p>${product.price.toFixed(2)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

## Advanced Tips and Best Practices

### Error Handling

Include proper error handling in your Liquid templates:

```liquid
{% assign contentType = "application/json" %}
{% fetchxml data %}
  // FetchXML query
{% endfetchxml %}

{% if data.error %}
{
  "error": true,
  "message": "{{ data.error.message | escape }}",
  "code": {{ data.error.code | default: 500 }}
}
{% else %}
{
  // Your normal JSON response
}
{% endif %}
```

### Pagination

Implement pagination for large datasets:

```liquid
{% assign contentType = "application/json" %}
{% assign pageSize = request.params.pageSize | default: 10 | plus: 0 %}
{% assign pageNumber = request.params.page | default: 1 | plus: 0 %}
{% assign offset = pageSize | times: pageNumber | minus: pageSize %}

{% fetchxml paged_results %}
<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false" count="{{ pageSize }}" page="{{ pageNumber }}">
  // Entity and attributes
</fetch>
{% endfetchxml %}

{
  "items": [
    // Format your items here
  ],
  "pagination": {
    "page": {{ pageNumber }},
    "pageSize": {{ pageSize }},
    "totalRecords": {{ paged_results.results.total-record-count | default: 0 }},
    "totalPages": {{ paged_results.results.total-record-count | divided_by: pageSize | ceil }}
  }
}
```

### Security Considerations

- Always escape user input and output to prevent injection attacks
- Use the principle of least privilege for your page permissions
- Don't expose sensitive fields in your JSON output
- Consider implementing authentication for sensitive endpoints
- Add rate limiting if necessary through the portal's web API settings

## Troubleshooting Common Issues

### Invalid JSON

If your API is returning invalid JSON, check for:

- Trailing commas after the last item in arrays or objects
- Missing quotes around property names
- Unescaped quotes or special characters in string values
- HTML content being mixed with your JSON output (check content type)

### Empty Results

If your endpoint returns empty results, verify:

- FetchXML query is correct and returns data when tested in XrmToolBox
- User has appropriate permissions to read the requested data
- Filters aren't accidentally excluding all records

### CORS Issues

If facing CORS issues when calling from another domain:

- Use this Power Portal Proxy as a middleware between your app and portal
- Alternatively, consider hosting your React app directly on the portal

## Useful Resources

- [Microsoft Power Pages Liquid Overview](https://learn.microsoft.com/en-us/power-pages/configure/liquid/liquid-overview)
- [FetchXML Liquid Tag Reference](https://learn.microsoft.com/en-us/power-pages/configure/liquid/fetchxml-liquid-tag)
- [Liquid Objects in Power Pages](https://learn.microsoft.com/en-us/power-pages/configure/liquid/liquid-objects)
- [FetchXML Schema Reference](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/fetchxml-schema)
- [React Power Portal Proxy GitHub Repository](https://github.com/garethcheyne/React-Power-Portal-Proxy)