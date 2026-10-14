"""One-off: draw a Simpsons-style still for every timeline card into frontend/public/art/cards/{id}.webp."""
import io
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
from PIL import Image  # noqa: E402

import falmedia  # noqa: E402

OUT = Path(__file__).parent.parent / "frontend" / "public" / "art" / "cards"

STYLE = (
    "A frame from a classic episode of The Simpsons, authentic Simpsons cel animation style: yellow skin, big round eyes, "
    "overbites, bright saturated flat colors, thick clean black outlines, sunny lighting. {scene} Characters are drawn exactly "
    "as they appear in the show. Widescreen, medium shot, expressive faces. No text, no captions, no readable words, no logos, no watermarks."
)

SCENES = {
    "superbowl-26": "Lisa Simpson and Homer Simpson on the couch in the Simpsons living room watching a football game on TV, Lisa confidently pointing at the screen, Homer excited holding a bowl of chips.",
    "autocorrect": "Two Springfield Elementary bullies, Kearney and Dolph, outside the school, one holding a chunky 1990s handheld PDA with a stylus and staring at its screen, confused.",
    "farmville": "Bart Simpson playing a chunky arcade machine at a colourful carnival, the arcade screen shows a tiny cartoon lawnmower cutting grass, a line of Springfield kids waiting behind him, blank booth sign.",
    "video-calls": "Marge Simpson in her kitchen smiling and waving at grown-up Lisa Simpson who appears on a retro-futuristic video phone screen mounted on the wall.",
    "three-eyed-fish": "Bart Simpson on a riverbank proudly holding up a fishing rod with Blinky, the orange three-eyed fish, on the hook, nuclear power plant cooling towers in the background.",
    "higgs": "Homer Simpson as an inventor in a cluttered basement workshop, standing proudly at a green chalkboard covered in mathematical scribbles, holding chalk.",
    "hologram": "Grown-up Bart Simpson with stubble in a messy apartment, jaw dropped, as a glowing translucent blue hologram of a tiny person stands projected in mid-air above a small round device on the coffee table, light beams.",
    "shard": "Grown-up Lisa Simpson walking along the River Thames in London, a cartoon London skyline behind her with Tower Bridge and a tall pointed glass skyscraper.",
    "voting-machine": "Homer Simpson inside a voting booth angrily jabbing the buttons of a malfunctioning electronic voting machine that sparks and smokes.",
    "horsemeat": "Lunchlady Doris in the Springfield Elementary cafeteria kitchen stirring a giant steaming pot next to a big metal drum, Bart Simpson in the lunch line looking disgusted.",
    "beatles-letter": "Marge Simpson at the kitchen table opening an old envelope with joyful surprise, hearts floating around her, a framed portrait of a 1960s mop-top drummer on the wall.",
    "smartwatch": "Close medium shot: a tall British gentleman with floppy brown hair, drawn in Simpsons style, holding his wrist up to his mouth and talking into a big chunky wristwatch with a glowing screen, grown-up Lisa Simpson smiling next to him, futuristic city street.",
    "fifa": "Homer Simpson in a black-and-white referee shirt on a soccer pitch inside a packed stadium, police officers marching a man in a suit away in the background.",
    "greece": "Kent Brockman at the Channel 6 news desk, over his shoulder a cartoon map of Greece wearing a price tag.",
    "trump": "Grown-up Lisa Simpson, President of the United States, alone behind the big desk in the Oval Office, looking stressed and holding her head, the desk buried under towering stacks of unpaid bills, American flag behind her.",
    "nobel": "Milhouse Van Houten and Lisa Simpson in a living room excitedly holding up a betting slip together, gold medals sparkling in a thought bubble.",
    "david": "Springfield townspeople led by Marge Simpson protesting with blank picket signs around a giant marble statue of Michelangelo's David in the town square.",
    "gaga": "Lady Gaga as drawn in The Simpsons flying high above a cheering stadium crowd on wires in a sparkling outfit, Lisa Simpson looking up in awe.",
    "curling": "Winter Olympics curling: Marge Simpson with her tall blue beehive hair crouching and releasing a red curling stone on the ice, Homer Simpson, bald in a white shirt, sweeping furiously with a broom in front of the stone, cheering crowd in the stands.",
    "disney-fox": "Homer Simpson sneaking through the giant gates of a Hollywood movie studio at night, searchlights sweeping the sky, a water tower shaped like round mouse ears.",
    "serfsons": "Medieval Springfield with Homer Simpson as a peasant running in panic as a huge dragon flies overhead breathing fire onto thatched-roof cottages.",
    "kamala": "Grown-up Lisa Simpson in a purple pantsuit and pearl necklace standing proudly at a podium being sworn in as President, American flags behind her.",
    "branson": "Outer space: a smiling man with long blond hair and a blond beard, drawn in Simpsons style, wearing a white spacesuit, floating weightless inside a spaceship cabin, admiring a framed painting floating next to him, planet Earth visible through a round window.",
    "hanks": "Tom Hanks as drawn in The Simpsons Movie, smiling warmly in a suit in front of the US Capitol building with an American flag.",
}


def draw(pid: str) -> str:
    dst = OUT / f"{pid}.webp"
    if dst.exists():
        return f"{pid}: exists"
    for attempt in range(3):
        try:
            data = falmedia.flux_text_to_image(STYLE.format(scene=SCENES[pid]))
            if not data:
                continue
            img = Image.open(io.BytesIO(data)).convert("RGB")
            img = img.resize((960, int(960 * img.height / img.width)), Image.LANCZOS)
            img.save(dst, "WEBP", quality=82)
            return f"{pid}: ok {img.size}"
        except Exception as e:  # noqa: BLE001
            print(f"{pid}: attempt {attempt + 1} failed: {e}", flush=True)
    return f"{pid}: FAILED"


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    ids = sys.argv[1:] or list(SCENES)
    with ThreadPoolExecutor(6) as pool:
        for line in pool.map(draw, ids):
            print(line, flush=True)
