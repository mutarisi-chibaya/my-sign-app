from groq import Groq

class TextProcessor:
    def __init__(self, groq_key):
        self.client = Groq(api_key=groq_key)
        # Updated map to include Shona
        self.lang_map = {
            'en': 'English',
            'zu': 'IsiZulu',
            'af': 'Afrikaans',
            'xh': 'IsiXhosa',
            'sn': 'chiShona'
        }

    def translate_to_gloss(self, speech_text, from_lang='en'):
        """
        NEW: Converts spoken native language into English ASL Glosses 
        for the avatar to sign.
        """
        if not speech_text:
            return ""

        source_name = self.lang_map.get(from_lang, 'English')

        try:
            completion = self.client.chat.completions.create(
                messages=[{
                    "role": "system", 
                    "content": (
                        f"You are a Sign Language Linguistics expert. "
                        f"Convert the following {source_name} text into English ASL Glosses. "
                        "RULES: "
                        "1. Use UPPERCASE only. "
                        "2. Remove small words like 'am, is, are, the, a, of'. "
                        "3. Keep the core meaning. "
                        "4. Output ONLY the glosses, no punctuation or extra text."
                    )
                },
                {"role": "user", "content": f"Text: {speech_text}"}],
                model="llama-3.3-70b-versatile",
                temperature=0.1, # Lower temp for more consistent glossing
            )
            return completion.choices[0].message.content.strip()
        except Exception as e:
            print(f"Speech-to-Gloss Error: {e}")
            return speech_text.upper() # Fallback

    def polish_and_translate(self, gloss_list, target_lang='en'):
        """
        EXISTING: Converts recognized signs into a natural native sentence.
        """
        if not gloss_list:
            return {"english": "", "translated": ""}

        raw_glosses = " ".join([str(g).strip() for g in gloss_list if str(g).strip()])
        target_name = self.lang_map.get(target_lang, 'English')

        try:
            completion = self.client.chat.completions.create(
                messages=[{
                    "role": "system", 
                    "content": (
                        f"You are a professional Sign Language interpreter. "
                        f"Step 1: Convert these ASL glosses into a natural English sentence. "
                        f"Step 2: Translate that sentence into {target_name}. "
                        f"Output ONLY the {target_name} sentence."
                    )
                },
                {"role": "user", "content": f"Glosses: {raw_glosses}"}],
                model="llama-3.3-70b-versatile",
                temperature=0.3,
            )
            result_text = completion.choices[0].message.content.strip()

            return {
                "english": "Processing done", 
                "translated": result_text,
                "target_lang": target_lang
            }
        except Exception as e:
            print(f"Gloss-to-Text Error: {e}")
            return {"english": raw_glosses, "translated": raw_glosses, "target_lang": 'en'}