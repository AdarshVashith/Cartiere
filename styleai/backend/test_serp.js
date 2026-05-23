const fetch = require('node-fetch');
require('dotenv').config();

async function testResolution() {
  const storeTitle = "Grey Crew Neck Sweater Men Slim Fit";
  const storeName = "Amazon.in";
  const apiKey = process.env.SERPAPI_KEY;
  
  let siteFilter = 'site:amazon.in';
  const searchQuery = `${storeTitle} ${siteFilter}`;
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(searchQuery)}&api_key=${apiKey}&num=5&gl=in&hl=en`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    console.log("SerpApi Response keys:", Object.keys(data));
    if (data.error) {
      console.log("SerpApi Error:", data.error);
    }
    if (data.organic_results) {
      data.organic_results.forEach((res, i) => {
        console.log(`Result ${i+1}:`, res.link);
      });
    } else {
        console.log('No organic results found for:', searchQuery);
    }
  } catch (e) {
    console.error(e);
  }
}

testResolution();
