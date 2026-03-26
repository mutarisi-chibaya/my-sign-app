import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

# --- CONFIGURATION ---
MODEL_ID = "rrrr66254/Glossa-BART"

# Initialize Tokenizer and Model
# trust_remote_code is required for some custom BART implementations
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)
model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_ID, trust_remote_code=True)

# Set to Evaluation Mode (Disables Dropout for consistent results)
model.eval()

# GPU Optimization: Use Half-Precision (FP16) to double the speed
device = "cuda" if torch.cuda.is_available() else "cpu"
if device == "cuda":
    model = model.to(device).half()
else:
    model = model.to(device)

def translate_gloss_to_english(gloss_list):
    """
    Takes a list of detected signs [ 'ME', 'GO', 'STORE' ] 
    and returns a fluent sentence: "I am going to the store."
    """
    if not gloss_list:
        return ""

    # 1. Join the list into a single string "ME GO STORE"
    input_text = " ".join(gloss_list).upper()

    # 2. Tokenize the input for the Transformer
    inputs = tokenizer(input_text, return_tensors="pt", padding=True, truncation=True)
    
    # Move tokens to the same device as the model
    inputs = {k: v.to(device) for k, v in inputs.items()}

    # 3. Generate the sequence
    # num_beams=1 (Greedy Search) is fastest for live translation
    with torch.no_grad():
        outputs = model.generate(
            **inputs, 
            max_new_tokens=50, 
            num_beams=1, 
            do_sample=False
        )

    # 4. Decode the tokens back into a string
    prediction = tokenizer.decode(outputs[0], skip_special_tokens=True)
    
    return prediction