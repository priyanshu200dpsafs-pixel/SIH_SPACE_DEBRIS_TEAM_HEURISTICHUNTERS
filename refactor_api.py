import os
import glob

def refactor_frontend():
    base_dir = "/Users/priyanshu/Desktop/space-debris-tracker/frontend/src"
    files = glob.glob(f"{base_dir}/**/*.jsx", recursive=True) + glob.glob(f"{base_dir}/*.jsx", recursive=True)
    
    for filepath in files:
        with open(filepath, "r") as f:
            content = f.read()
            
        if "fetch('/api/v1" in content or "fetch(`/api/v1" in content:
            # Inject import.meta.env
            new_content = "const API_BASE_URL = import.meta.env.VITE_API_URL || '';\n" + content
            
            # Replace single quotes
            new_content = new_content.replace("fetch('/api/v1", "fetch(API_BASE_URL + '/api/v1")
            
            # Replace template literals (backticks)
            # e.g. fetch(`/api/v1/conjunctions/${activeConj.id}/cam` -> fetch(`${API_BASE_URL}/api/v1/conjunctions/${activeConj.id}/cam`
            new_content = new_content.replace("fetch(`/api/v1", "fetch(`${API_BASE_URL}/api/v1")
            
            with open(filepath, "w") as f:
                f.write(new_content)
                
            print(f"Updated {filepath}")

if __name__ == "__main__":
    refactor_frontend()
