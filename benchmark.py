import requests
import time

url = "http://localhost:8000/api/pipeline-mesh"
files = [('files', ('test.jpg', open('frontend/public/images/bg.jpg', 'rb'), 'image/jpeg'))]

start = time.time()
response = requests.post(url, files=files)
end = time.time()

print(f"Status Code: {response.status_code}")
print(f"Time taken: {end - start:.2f} seconds")
