# Import necessary packages form custom sdk (langchain_tcs_bfsi_genai)
from langchain_tcs_bfsi_genai import APIClient,Auth,TCSChatModel,TCSEmbeddings
import os
import yaml 
from langchain_core.messages import AIMessageChunk, BaseMessage, HumanMessage, AIMessage, ToolMessage, SystemMessage
from sqlalchemy.orm import Session
from sqlalchemy import select

from openai import OpenAI
import httpx
import urllib.request

PROXY_URL = "http://proxy.tcs.com:8080"

#CODE PRIOR TO ADMIN IMPLEMENTATION
def old_invoke(query, username, password, model):
    print("inside invoke...")
    try:
        client = APIClient()
        auth = Auth(client)
        auth.login(username, password)
        chat = TCSChatModel(client=client, model_name=model)
        llm_response = chat.invoke(query).content.strip()
        return llm_response
    except Exception as e:
        print(f"Error is here {e}")
        if "401" in str(e) or "unauthorized" in str(e).lower():
           print("⚠️ Token expired. Refreshing and retrying...")
           # Re-login to refresh token
           new_client = APIClient()
           auth = Auth(new_client)
           auth.login(username, password)  # use your creds
           new_chat = TCSChatModel(client=new_client, model_name=model)
           llm_response = new_chat.invoke(query).content.strip()
           return llm_response
        else:
           raise

def invoke(query, model='llama3.2:3b'):
    """
    Calls the Ollama API via an OpenAI-compatible client.
    Returns the string content of the LLM response.
    """
    print("inside ollama invoke...")
   
    try:
        # 1. Setup Proxies (keeping your existing logic)
        is_proxy_enable = urllib.request.getproxies()
        if is_proxy_enable != {}:
            ips = os.getenv("NO_PROXY_IPS", "").split(",")
            os.environ['http_proxy'] = PROXY_URL
            os.environ['https_proxy'] = PROXY_URL
            os.environ['no_proxy'] = ",".join(ips)
 
        # 2. Initialize Client
        # Note: 'ollama' is used as the API key for local/hosted Ollama instances
        client = OpenAI(
            base_url='https://ismartams.tcsapps.com/ollama/v1/',
            api_key='ollama',
            http_client=httpx.Client(verify=False)
        )
 
        # 3. Request Completion
        response = client.chat.completions.create(
            model=model,
            messages=[
                {'role': 'user', 'content': query}
            ]
        )
 
        # 4. Extract content to match your previous return type (string)
        # Using .strip() to maintain consistency with your old method
        llm_response = response.choices[0].message.content.strip()
        print(llm_response)
        return llm_response
 
    except Exception as e:
        print(f"Error in Ollama invoke: {e}")
        raise

def embed__texts1(texts: list[str]):
    resp = client.embeddings.create("text-embedding-ada-002", input=texts)
    return [item.embedding for item in resp.data]

def embed__texts(texts: list[str], username, password):
    try:
        client = APIClient()
        auth = Auth(client)
        auth.login(username, password)
        embeddings = TCSEmbeddings(client, "bge")
        resp = embeddings.embed(texts)
        return resp
    except Exception as e:
        print(f"Error is here {e}")
        if "401" in str(e) or "unauthorized" in str(e).lower():
           print("⚠️ Token expired. Refreshing and retrying...")
           # Re-login to refresh token
           new_client = APIClient()
           auth = Auth(new_client)
           auth.login(username, password)
           # Recreate embeddings with new client
           embeddings = TCSEmbeddings(new_client, "bge")
           resp = embeddings.embed(texts)
           return resp
        else:
           raise   
class PromptNotFound(Exception): ...
class InvalidPrompt(Exception): ...

def _load_yaml(namespace: str, account_name: str, application_name: str) -> dict:
    base_dir = os.path.join(os.getcwd(), "ARE_ACCOUNTS")
    # print("base_dir", base_dir)
    account_dir=os.path.join(base_dir,account_name)
    application_dir = os.path.join(account_dir,application_name)
    # print("application_dir", application_dir)
    PROMPTS_DIR=os.path.join(application_dir,"prompt")
    # print(PROMPTS_DIR)

    path = os.path.join(PROMPTS_DIR, f"{namespace}.yaml")
    if not os.path.exists(path):
        raise PromptNotFound(f"No prompt file found for namespace {namespace}")
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}

def get_prompt(account_name: str, application_name: str, namespace: str, name: str, version: str | None = None) -> dict:
    print(f"Reading prompt from {account_name} and {application_name}")
    data = _load_yaml(namespace, account_name, application_name)

    prompts = data.get("prompts", {})
    if name not in namespace:
        raise PromptNotFound(f"No prompt named '{name}' in namespace '{namespace}'")

    if not version:
        version = sorted(prompts.keys())[-1]  # latest version

    prompt_entry = prompts.get(version)
    if not prompt_entry:
        raise PromptNotFound(f"No version '{version}' for prompt '{name}'")

    return {
        "namespace": namespace,
        "name": name,
        "version": version,
        **prompt_entry
    }


def render_template(template: str, variables: dict) -> str:
    # ultra-lightweight {{ var }} replacement (no Jinja dependency)
    print("render_template variables")
    print(variables)
    out = template
    for k, v in (variables or {}).items():
        out = out.replace("{{ "+k+" }}", str(v))
        out = out.replace("{{"+k+"}}", str(v))
    return out

def get_prompt_text(account_name: str, application_name: str, namespace: str, version: str | None = None, variables: dict | None = None) -> str:
    p = get_prompt(account_name, application_name, namespace, namespace, version)    
    return render_template(p.get("template", ""), variables or {})