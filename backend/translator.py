# backend/translator.py
from groq import Groq

class TextProcessor:
    def __init__(self, groq_key):
        self.client = Groq(api_key=groq_key)

    def polish_and_translate(self, gloss_list, target_lang='en'):
        """
        Does BOTH grammar polishing and translation in ONE LLM call.
        No googletrans library needed!
        """
        if not gloss_list:
            return {"english": "", "translated": ""}

        raw_glosses = " ".join([str(g).strip() for g in gloss_list if str(g).strip()])
        print(f"Raw Glosses: {raw_glosses}")  # Debugging output
        # Mapping language codes to full names for the AI
        lang_map = {
            'zu': 'IsiZulu',
            'af': 'Afrikaans',
            'xh': 'IsiXhosa',
            'en': 'English'
        }
        target_name = lang_map.get(target_lang, 'English')

        try:
            # We ask the LLM to provide BOTH versions in a specific format
            completion = self.client.chat.completions.create(
                messages=[{
                    "role": "system", 
                    "content": (
                        f"You are a professional Sign Language interpreter. "
                        f"Step 1: Convert these ASL glosses into a natural English sentence. "
                        f"Step 2: Translate that sentence into {target_name}. "
                        f"Output ONLY the {target_name} sentence. No explanations."
                    )
                },
                {"role": "user", "content": f"Glosses: {raw_glosses}"}],
                model="llama-3.3-70b-versatile",
                temperature=0.3,
            )
            result_text = completion.choices[0].message.content.strip()
            
            print(f"LLM Output: {result_text}")  # Debugging output

            return {
                "english": "Processing done", # We can ignore this for now
                "translated": result_text,
                "target_lang": target_lang
            }
        except Exception as e:
            print(f"LLM Error: {e}")
            return {"english": raw_glosses, "translated": raw_glosses, "target_lang": 'en'}