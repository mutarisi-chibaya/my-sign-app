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

    def polish_and_translate(self, gloss_list, target_lang='en', auto_mode=True):
        """
        FIXED: Converts signs into natural grammar, protects data, 
        AND translates to the target language.
        """
        if not gloss_list:
            return {"english": "", "translated": ""}

        raw_glosses = " ".join([str(g).strip() for g in gloss_list if str(g).strip()])
        target_name = self.lang_map.get(target_lang, 'English')

        # If auto_mode is off, we skip the LLM entirely and return raw glosses
        if not auto_mode:
            return {
                "english": raw_glosses, 
                "translated": raw_glosses, 
                "target_lang": target_lang
            }

        system_prompt = (
            f"You are a master Sign Language interpreter and polyglot fluent in {target_name}. "
            f"Your goal is to take English ASL glosses and provide a natural translation in {target_name}.\n\n"
            "--- PROCESSING RULES ---\n"
            "1. LINGUISTIC MAPPING: Convert ASL structures to natural sentences. (e.g., 'YOU NAME' -> 'What is your name?').\n"
            "2. DATA PROTECTION: If the input is numbers ('1 2 3') or acronyms ('A T T'), keep them as '123' or 'ATT'.\n"
            f"3. FINAL OUTPUT: Translate the resulting meaning into {target_name}.\n\n"
            "--- EXAMPLES ---\n"
            f"- Input: 'YOU NAME' -> Result in {target_name}: 'Ubani igama lakho?' (if Zulu) or 'Zita rako ndiani?' (if Shona).\n"
            f"- Input: '1 2 3' -> Result in {target_name}: '123'.\n"
            f"- Input: 'MY PHONE 0 7 2' -> Result in {target_name}: 'Ucingo lwami ngu-072.' (if Zulu).\n\n"
            f"Output ONLY the final {target_name} sentence. Do not include English unless the target is English."
        )

        try:
            completion = self.client.chat.completions.create(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Glosses: {raw_glosses}"}
                ],
                model="llama-3.3-70b-versatile",
                temperature=0.1, # Keep it low for accuracy
            )
            result_text = completion.choices[0].message.content.strip()

            return {
                "english": "Translation Complete", 
                "translated": result_text,
                "target_lang": target_lang
            }
        except Exception as e:
            print(f"Gloss-to-Text Error: {e}")
            return {"english": raw_glosses, "translated": raw_glosses, "target_lang": target_lang}