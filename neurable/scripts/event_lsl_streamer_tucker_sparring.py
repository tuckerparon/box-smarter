import pylsl

def send_event(lsl_outlet, label):
    input('\nPress Enter key to START the event')
    start_label = 'Start,' + label
    lsl_outlet.push_sample([start_label])
    print('Sent ' + start_label)
    input('\nPress Enter to STOP the event')
    end_label = 'Stop,' + label
    lsl_outlet.push_sample([end_label])
    print('Sent ' + end_label)

lsl_info = pylsl.StreamInfo("EventType,EventName", "Markers", 1, 0, "string", "event_labeler")
lsl_outlet = pylsl.StreamOutlet(lsl_info)
print('\nEvent labels with start and stop markers')
print('------------------------------------------')
print('Check "EventType,EventName" is selected in LabRecorder.') 
input('Press Enter to continue...')


available_inputs = [
    'eyes_open_sparing_day',
    'eyes_closed_sparing_day',
    'working_sparing_day',
    'relaxing_sparing_day',
]

mapper = {str(i+1):l for i,l in enumerate(available_inputs)}

while True:
    print(f'\nPlease input the number, choosen from one of the following options: ')
    for i, s in mapper.items():
        print(f'{i}: {s}')
    option = input(f'\nChoice: ')
    label = mapper.get(option,'unknown')
    while label not in available_inputs:
        print(f'\nChosen option {option} not found.')
        print(f'\nPlease input the number, choosen from one of the following options: ')
        for i, s in mapper.items():
            print(f'{i}: {s}')
        option = input(f'\nChoice: ')
        label = mapper.get(option,'unknown')
    send_event(lsl_outlet, label)
    print('\nTo exit, press Ctrl-C to exit or close this window.')
