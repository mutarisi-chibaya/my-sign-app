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
            f"You are a minimalist Sign Language interpreter and translator into {target_name}. "
            "Your only task is to output the final translated text. "
            "\n--- STRICT FORMATTING RULES ---\n"
            "1. NO EXPLANATIONS: Do not say 'The letters are', 'The numbers are', or 'Translation:'.\n"
            "2. DATA PRESERVATION: If the input is a sequence of letters (e.g., 'A B C'), output ONLY the letters as a single word: 'ABC'.\n"
            "3. NUMBER PRESERVATION: If the input is numbers (e.g., '1 2 3'), output ONLY the digits: '123'.\n"
            "4. GRAMMAR: If the input is a sentence (e.g., 'YOU NAME'), translate it naturally into {target_name}.\n"
            "\n--- EXAMPLES ---\n"
            "Input: 'A B C' -> Output: 'ABC'\n"
            "Input: '1 2 3' -> Output: '123'\n"
            "Input: 'A T T' -> Output: 'ATT'\n"
            f"Input: 'YOU NAME' -> Output: [Translated '{target_name}' version of 'What is your name?']\n"
            "\nOUTPUT ONLY THE RESULTING TEXT."
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